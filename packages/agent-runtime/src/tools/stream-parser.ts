import { toolNames } from '@codebuff/common/tools/constants'
import { toolMetadata } from '@codebuff/common/tools/metadata'
import { buildArray } from '@codebuff/common/util/array'
import { AbortError } from '@codebuff/common/util/error'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'

import { processStreamWithTools } from '../tool-stream-parser'
import { DEFAULT_INCLUDE_REASONING_IN_MESSAGE_HISTORY } from '../constants'
import {
  executeCustomToolCall,
  executeToolCall,
  tryTransformAgentToolCall,
} from './tool-executor'
import { withSystemTags } from '../util/messages'
import { normalizeToolPath } from './handlers/tool/write-file'

import type { CustomToolCall, ExecuteToolCallParams } from './tool-executor'
import type { AgentTemplate } from '../templates/types'
import type { FileProcessingState } from './handlers/tool/write-file'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'
import type { ProviderMetadata } from '@codebuff/common/types/messages/provider-metadata'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { Subgoal } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

/**
 * Tools that only perform read operations and are safe to run concurrently with
 * each other. These tools only mutate idempotent bookkeeping in fileProcessingState
 * (e.g. read auth grants, clearing stale promise refs) and do not modify file
 * contents. Concurrent reads on the same path are safe because the mutations are
 * idempotent and write tools are serialized after all in-flight reads.
 */
const READ_ONLY_TOOLS = new Set<string>(
  toolNames.filter(
    (toolName) => toolMetadata[toolName].scheduling === 'read_only',
  ),
)

export async function processStream(
  params: {
    agentContext: Record<string, Subgoal>
    agentTemplate: AgentTemplate
    ancestorRunIds: string[]
    fileContext: ProjectFileContext
    fingerprintId: string
    fullResponse: string
    logger: Logger
    messages: Message[]
    repoId: string | undefined
    runId: string
    signal: AbortSignal
    userId: string | undefined

    onCostCalculated: (providerCostCents: number) => Promise<void>
    onResponseChunk: (chunk: string | PrintModeEvent) => void
  } & Omit<
    ExecuteToolCallParams<any>,
    | 'fileProcessingState'
    | 'fromHandleSteps'
    | 'fullResponse'
    | 'input'
    | 'previousToolCallFinished'
    | 'state'
    | 'toolCallId'
    | 'toolCalls'
    | 'toolCallsToAddToMessageHistory'
    | 'toolName'
    | 'toolResults'
    | 'toolResultsToAddToMessageHistory'
  > &
    ParamsExcluding<
      typeof processStreamWithTools,
      'processors' | 'defaultProcessor' | 'loggerOptions' | 'executeXmlToolCall'
    >,
) {
  const {
    agentState,
    agentTemplate,
    ancestorRunIds,
    fileContext,
    fullResponse,
    onCostCalculated,
    onResponseChunk,
    runId,
    signal,
    userId,
  } = params
  const fullResponseChunks: string[] = [fullResponse]
  const includeReasoningInMessageHistory =
    agentTemplate.includeReasoningInMessageHistory ??
    DEFAULT_INCLUDE_REASONING_IN_MESSAGE_HISTORY

  // === MUTABLE STATE ===
  const toolResults: ToolMessage[] = []
  const toolResultsToAddToMessageHistory: ToolMessage[] = []
  const toolCalls: (CodebuffToolCall | CustomToolCall)[] = []
  const toolCallsToAddToMessageHistory: (CodebuffToolCall | CustomToolCall)[] =
    []
  const assistantMessages: Message[] = []
  let hadToolCallError = false
  const errorMessages: Message[] = []
  // Per-path write barriers. Writes on DIFFERENT paths run concurrently;
  // writes on the SAME path serialize via the barrier slot for that path (plus
  // the handler's own fileProcessingState.promisesByPath[path] chain, which is
  // the fine-grained correctness mechanism). The first write on a given path
  // has no prior barrier (the Map has no entry), so it begins immediately —
  // this unblocks the "pending" stall the old single global
  // `lastWriteFinished = streamDonePromise` chain caused, where every write's
  // `previousToolCallFinished` was blocked on a promise that only resolved at
  // stream end.
  const writeBarriersByPath = new Map<string, Promise<void>>()
  // Custom/MCP tools and any write whose target path cannot be statically
  // determined serialize against each other AND against all named-path writes
  // via this global barrier (they might touch any path, so they are treated
  // conservatively as cross-path writes).
  let customToolBarrier: Promise<void> = Promise.resolve()
  let activeGlobalWrite: Promise<void> | undefined
  // Read-only tools only mutate idempotent bookkeeping in fileProcessingState
  // (read auth grants, clearing stale promise refs) and are safe to run
  // concurrently with each other. Active reads remain in this set until they
  // settle so every subsequently issued write observes the same read barrier.
  const inFlightReads = new Set<Promise<void>>()

  // Returns the outstanding write barrier for a path, or a resolved promise if
  // this is the first write on that path (it has no prior barrier and may begin
  // immediately).
  const getWriteBarrierForPath = (path: string): Promise<void> =>
    writeBarriersByPath.get(path) ?? Promise.resolve()
  const setWriteBarrierForPath = (
    path: string,
    barrier: Promise<void>,
  ): void => {
    writeBarriersByPath.set(path, barrier)
  }
  const waitForOutstandingTools = () =>
    Promise.all([
      ...writeBarriersByPath.values(),
      customToolBarrier,
      ...inFlightReads,
    ]).then(() => {})

  // Extracts the normalized target path from a write tool's input, for the
  // purpose of selecting the per-path write barrier. Returns `undefined` when
  // the tool is a custom/unknown-path write (no statically determinable single
  // target path), so the caller falls back to the global custom-tool barrier.
  // `normalizeToolPath` strips leading `./` and rejects `..` traversal segments
  // (mirroring the handler's own normalization); an empty/missing path also
  // falls back to the custom-tool barrier.
  const extractWritePath = (
    name: string,
    toolInput: Record<string, unknown>,
  ): string | undefined => {
    if (
      name === 'str_replace' ||
      name === 'write_file' ||
      name === 'apply_smart_patch' ||
      name === 'create_plan' ||
      name === 'replace_range'
    ) {
      const raw = toolInput.path
      if (typeof raw !== 'string' || raw.length === 0) return undefined
      const normalized = normalizeToolPath(raw)
      return normalized.length > 0 ? normalized : undefined
    }
    if (name === 'apply_patch') {
      const operation = toolInput.operation
      if (!operation || typeof operation !== 'object') return undefined
      const raw = (operation as { path?: unknown }).path
      if (typeof raw !== 'string' || raw.length === 0) return undefined
      const normalized = normalizeToolPath(raw)
      return normalized.length > 0 ? normalized : undefined
    }
    if (name === 'edit_transaction') {
      const edits = toolInput.edits
      if (!Array.isArray(edits)) return undefined
      const paths: string[] = []
      for (const edit of edits) {
        if (
          edit &&
          typeof edit === 'object' &&
          typeof (edit as { path?: unknown }).path === 'string'
        ) {
          const normalized = normalizeToolPath((edit as { path: string }).path)
          if (normalized.length > 0) {
            paths.push(normalized)
          } else {
            return undefined
          }
        } else {
          return undefined
        }
      }
      if (paths.length === 0) return undefined
      // If all edits target the SAME path, treat as a single-path write so it
      // can run concurrently with writes on other paths. If edits target
      // multiple distinct paths, the handler processes them as one atomic batch
      // touching multiple paths, so serialize against the custom-tool barrier
      // (return undefined).
      if (paths.every((p) => p === paths[0])) {
        return paths[0]
      }
      return undefined
    }
    return undefined
  }

  // Hydrate cross-turn read authorization from agentState. Each processStream
  // invocation creates a fresh fileProcessingState, so any read auth granted
  // by read_files or write_file in a prior turn would otherwise be lost. The
  // agentState.readAuthorizationsByPath registry survives across LLM turns
  // because agentState is the durable per-run state object.
  const fileProcessingState: FileProcessingState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    failedEditRequiresReadByPath: {},
    consecutiveStrReplaceFailuresByPath: {},
    strictReadBeforeEdit: true,
    readAuthorizationsByPath: {
      ...(agentState.readAuthorizationsByPath ?? {}),
    },
    readAuthorizationHashesByPath: {
      ...(agentState.readAuthorizationHashesByPath ?? {}),
    },
    editRereadRequirementsByPath: {
      ...(agentState.editRereadRequirementsByPath ?? {}),
    },
  }

  // === RESPONSE HANDLER ===
  // Creates a response handler that captures tool events into assistantMessages.
  // When isXmlMode=true, also captures tool_result events for interleaved ordering.
  function createResponseHandler() {
    return (chunk: string | PrintModeEvent) => {
      if (typeof chunk !== 'string') {
        if (chunk.type === 'error') {
          hadToolCallError = true
          errorMessages.push(
            userMessage({
              content: withSystemTags(
                `Error during tool call: ${chunk.message}. Please check the tool name and arguments and try again.`,
              ),
              tags: ['TOOL_CALL_ERROR'],
            }),
          )
        }
      }
      return onResponseChunk(chunk)
    }
  }

  // === TOOL EXECUTION ===
  // Unified callback factory for both native and custom tools.
  function createToolExecutionCallback(toolName: string, isXmlMode: boolean) {
    const responseHandler = createResponseHandler()
    return {
      onTagStart: () => {},
      onTagEnd: async (
        _: string,
        input: Record<string, string>,
        context?: { toolCallId?: string; providerOptions?: ProviderMetadata },
      ) => {
        if (signal.aborted) {
          return
        }
        const toolCallId = context?.toolCallId ?? generateCompactId()
        const isNativeTool = toolNames.includes(toolName as ToolName)

        // Check if this is an agent tool call that should be transformed to spawn_agents
        const transformed = !isNativeTool
          ? tryTransformAgentToolCall({
              toolName,
              input,
              spawnableAgents: agentTemplate.spawnableAgents,
            })
          : null

        // Determine if this is a read-only tool. Read-only tools only mutate
        // idempotent bookkeeping in fileProcessingState (read auth grants,
        // clearing stale promise refs) and are safe to run concurrently with
        // each other. Write tools (and custom/MCP tools, which are treated as
        // writes since we cannot prove they are side-effect-free) must wait for
        // all in-flight reads AND prior writes to complete.
        const resolvedToolName = transformed ? transformed.toolName : toolName
        const isReadOnlyTool =
          isNativeTool && READ_ONLY_TOOLS.has(resolvedToolName)

        // Determine the target path for this write tool, so it can be assigned
        // a per-path barrier. Named-path writes (str_replace / write_file /
        // edit_transaction / apply_smart_patch) serialize only against prior
        // writes to the SAME path; writes on DIFFERENT paths run concurrently.
        // Custom/MCP tools and any write whose path cannot be statically
        // determined (including a multi-path edit_transaction) serialize against
        // the global custom-tool barrier, which also serializes against every
        // named-path write (conservative: they might touch any path).
        const writePath = !isReadOnlyTool
          ? extractWritePath(resolvedToolName, input)
          : undefined

        // Compute the `queued` runtime signal for this write. A named-path write
        // is "queued" when a prior write to the SAME normalized path is still in
        // flight — i.e. its per-path barrier slot is present in
        // `writeBarriersByPath`. Read-only tools and custom/unknown-path writes
        // (writePath === undefined) omit `queued` (treated as not-queued). Only
        // `true` is emitted; the field is absent otherwise to keep event
        // objects minimal and avoid breaking exact-shape test assertions.
        const queued = !isReadOnlyTool
          ? writePath !== undefined
            ? writeBarriersByPath.has(writePath) ||
              activeGlobalWrite !== undefined ||
              inFlightReads.size > 0
              ? true
              : undefined
            : activeGlobalWrite !== undefined ||
                writeBarriersByPath.size > 0 ||
                inFlightReads.size > 0
              ? true
              : undefined
          : undefined

        // Compute the dependency promise for this tool.
        // - Read-only tools: wait for ALL outstanding writes (every path's last
        //   write barrier + the custom-tool barrier) so reads see committed
        //   state from any path, but do NOT wait for other in-flight reads
        //   (reads stay concurrent with each other) and do NOT advance any
        //   write barrier.
        // - Named-path writes: wait for prior global/unknown-path work, prior
        //   writes to the SAME path, and all active reads. They do not wait on
        //   unrelated named paths.
        // - Custom/unknown-path writes: wait for ALL outstanding writes + all
        //   in-flight reads (conservative, since they might touch any path).
        let previousPromise: Promise<void>
        if (isReadOnlyTool) {
          const allWriteBarriers = [
            customToolBarrier,
            ...writeBarriersByPath.values(),
          ]
          previousPromise = Promise.all(allWriteBarriers).then(() => {})
        } else if (writePath !== undefined) {
          const pathBarrier = getWriteBarrierForPath(writePath)
          previousPromise = Promise.all([
            customToolBarrier,
            pathBarrier,
            ...inFlightReads,
          ]).then(() => {})
        } else {
          const allWriteBarriers = [
            customToolBarrier,
            ...writeBarriersByPath.values(),
          ]
          previousPromise =
            inFlightReads.size > 0
              ? Promise.all([...allWriteBarriers, ...inFlightReads]).then(
                  () => {},
                )
              : Promise.all(allWriteBarriers).then(() => {})
        }

        // Determine which executor to use and with what parameters
        let toolPromise: Promise<void>
        if (isNativeTool || transformed) {
          // Use executeToolCall for native tools or transformed agent calls
          toolPromise = executeToolCall({
            ...params,
            toolName: transformed
              ? transformed.toolName
              : (toolName as ToolName),
            input: transformed ? transformed.input : input,
            fromHandleSteps: false,

            fileProcessingState,
            fullResponse: fullResponseChunks.join(''),
            previousToolCallFinished: previousPromise,
            providerOptions: context?.providerOptions,
            toolCallId,
            toolCalls,
            toolCallsToAddToMessageHistory,
            toolResults,
            toolResultsToAddToMessageHistory,
            excludeToolFromMessageHistory: false,
            onCostCalculated,
            queued,
            onResponseChunk: responseHandler,
          })
        } else {
          // Use executeCustomToolCall for custom/MCP tools
          toolPromise = executeCustomToolCall({
            ...params,
            toolName,
            input,

            fileProcessingState,
            fullResponse: fullResponseChunks.join(''),
            previousToolCallFinished: previousPromise,
            providerOptions: context?.providerOptions,
            toolCallId,
            toolCalls,
            toolCallsToAddToMessageHistory,
            toolResults,
            toolResultsToAddToMessageHistory,
            excludeToolFromMessageHistory: false,
            queued,
            onResponseChunk: responseHandler,
          })
        }

        // Update the dependency chains.
        // - Read-only tools: tracked in inFlightReads (concurrent with each
        //   other); they do NOT advance any write barrier.
        // - Named-path writes: advance only that path's barrier slot. Other
        //   paths remain concurrent, while active reads self-remove on settle.
        // - Custom/unknown-path writes: advance the global barrier. All later
        //   named writes wait for it, regardless of path extraction.
        const settledToolPromise = toolPromise.then(
          () => {},
          () => {},
        )
        if (isReadOnlyTool) {
          inFlightReads.add(settledToolPromise)
          settledToolPromise.then(() =>
            inFlightReads.delete(settledToolPromise),
          )
        } else if (writePath !== undefined) {
          setWriteBarrierForPath(writePath, settledToolPromise)
          // Clean up the per-path barrier entry once this write settles, so
          // `writeBarriersByPath.has(writePath)` accurately reflects in-flight
          // writes (and the finalization join only awaits outstanding entries).
          // Guard by promise identity: only delete if the Map still points at
          // THIS settled promise, so a newer same-path write's barrier is never
          // wrongly removed.
          settledToolPromise.then(() => {
            if (writeBarriersByPath.get(writePath) === settledToolPromise) {
              writeBarriersByPath.delete(writePath)
            }
          })
        } else {
          customToolBarrier = settledToolPromise
          activeGlobalWrite = settledToolPromise
          settledToolPromise.then(() => {
            if (activeGlobalWrite === settledToolPromise) {
              activeGlobalWrite = undefined
            }
          })
        }

        // For XML mode, await execution so results appear inline before stream continues
        if (isXmlMode) {
          await toolPromise
        }
      },
    }
  }

  // === STREAM PROCESSING ===
  const streamWithTags = processStreamWithTools({
    ...params,
    processors: Object.fromEntries([
      ...toolNames.map((name) => [
        name,
        createToolExecutionCallback(name, false),
      ]),
      ...Object.keys(fileContext.customToolDefinitions ?? {}).map((name) => [
        name,
        createToolExecutionCallback(name, false),
      ]),
    ]),
    defaultProcessor: (name: string) =>
      createToolExecutionCallback(name, false),
    loggerOptions: {
      userId,
      model: agentTemplate.model,
      agentName: agentTemplate.id,
    },
    onResponseChunk: (chunk) => {
      if (chunk.type === 'text') {
        if (chunk.text) {
          assistantMessages.push(assistantMessage(chunk.text))
        }
      } else if (chunk.type === 'error') {
        // do nothing
      } else {
        chunk satisfies never
        throw new Error(
          `Internal error: unhandled chunk type: ${(chunk as { type: unknown }).type}`,
        )
      }
      return onResponseChunk(chunk)
    },
    // Execute XML-parsed tool calls immediately during streaming
    executeXmlToolCall: async ({ toolName, input }) => {
      if (signal.aborted) {
        return
      }
      const callback = createToolExecutionCallback(toolName, true)
      await callback.onTagEnd(toolName, input as Record<string, string>)
    },
  })

  // === STREAM CONSUMPTION LOOP ===
  let messageId: string | null = null

  // Wrap in try/finally so that the finalization (message history update) always
  // runs even when the stream throws an AbortError mid-iteration.
  try {
    while (true) {
      if (signal.aborted) {
        break
      }
      const { value: chunk, done } = await streamWithTags.next()
      if (done) {
        // Handle PromptResult: extract value if success, null if aborted
        if (chunk && typeof chunk === 'object' && 'aborted' in chunk) {
          messageId = chunk.aborted ? null : chunk.value
        } else {
          messageId = chunk
        }
        break
      }

      if (chunk.type === 'reasoning') {
        if (includeReasoningInMessageHistory && chunk.text) {
          const last = assistantMessages[assistantMessages.length - 1]
          const lastPart =
            last?.role === 'assistant' && Array.isArray(last.content)
              ? last.content[last.content.length - 1]
              : undefined
          if (lastPart && lastPart.type === 'reasoning') {
            lastPart.text += chunk.text
          } else {
            assistantMessages.push(
              assistantMessage({ type: 'reasoning', text: chunk.text }),
            )
          }
        }
        onResponseChunk({
          type: 'reasoning_delta',
          text: chunk.text,
          ancestorRunIds,
          runId,
        })
      } else if (chunk.type === 'text') {
        onResponseChunk(chunk.text)
        fullResponseChunks.push(chunk.text)
      } else if (chunk.type === 'error') {
        onResponseChunk(chunk)
        hadToolCallError = true
        errorMessages.push(
          userMessage({
            content: withSystemTags(
              `Error during tool call: ${chunk.message}. Please check the tool name and arguments and try again.`,
            ),
            tags: ['TOOL_CALL_ERROR'],
          }),
        )
      } else if (chunk.type === 'tool-call') {
      } else {
        chunk satisfies never
        throw new Error(
          `Unhandled chunk type: ${(chunk as { type: unknown }).type}`,
        )
      }
    }
  } finally {
    // === FINALIZATION ===
    // Trigger cleanup of the processStreamWithTools generator so it flushes any
    // remaining buffered text to assistantMessages before we build the history.
    // On path B (AbortError thrown mid-stream) the generator is already completed
    // so .return() is a no-op. On path A (cooperative signal.aborted break) the
    // generator is still suspended and .return() triggers its finally → flush().
    try {
      await streamWithTags.return({ aborted: true })
    } catch {
      // Generator cleanup failed; assistantMessages may be incomplete but
      // we must not swallow the original error.
    }

    // Cancellation stops new dispatch, but terminal publication waits for all
    // already-started cooperative tools to unwind. SDK legacy overrides are
    // raced against the shared signal, so a non-cooperative external promise
    // cannot hold this cleanup barrier open or publish a late result.
    await waitForOutstandingTools()

    // Persist authorization only AFTER every in-flight read/edit has settled.
    // Writing this state before the barrier captured the pre-tool hash (or no
    // authorization at all) even though the UI later showed the tool as
    // complete, causing the next model step to reject a freshly read/edited
    // file as stale.
    agentState.readAuthorizationsByPath = {
      ...(fileProcessingState.readAuthorizationsByPath ?? {}),
    }
    agentState.readAuthorizationHashesByPath = {
      ...(fileProcessingState.readAuthorizationHashesByPath ?? {}),
    }
    agentState.editRereadRequirementsByPath = {
      ...(fileProcessingState.editRereadRequirementsByPath ?? {}),
    }

    // This runs even when the stream throws (e.g., AbortError mid-iteration).
    // Build message history from the current agentState.messageHistory so that
    // inline agent modifications (e.g. set_messages) are preserved, while
    // tool_calls and tool_results are still appended in deterministic order.
    //
    // When the signal was aborted, tool calls are added synchronously but tool
    // results arrive asynchronously via .then(). Because we skip awaiting
    // previousToolCallFinished on abort, some tool calls may not have matching
    // tool results yet. Including orphaned tool calls in the message history
    // causes provider errors ("unexpected tool_use_id found in tool_result
    // blocks"). Filter them out so every tool_call has a corresponding
    // tool_result.
    const completedToolCallIds = new Set(
      toolResultsToAddToMessageHistory.map((r) => r.toolCallId),
    )
    const filteredToolCalls = toolCallsToAddToMessageHistory.filter((tc) =>
      completedToolCallIds.has(tc.toolCallId),
    )

    agentState.messageHistory = buildArray<Message>([
      ...agentState.messageHistory,
      ...assistantMessages,
      ...filteredToolCalls.map((toolCall) =>
        assistantMessage({ ...toolCall, type: 'tool-call' }),
      ),
      ...toolResultsToAddToMessageHistory,
      ...errorMessages,
    ])
  }

  if (signal.aborted) {
    throw new AbortError()
  }

  return {
    fullResponse: fullResponseChunks.join(''),
    fullResponseChunks,
    hadToolCallError,
    messageId,
    toolCalls,
    toolResults,
  }
}
