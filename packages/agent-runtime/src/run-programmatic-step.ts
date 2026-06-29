import { HandleStepsYieldValueSchema } from '@codebuff/common/types/agent-template'
import { getErrorObject } from '@codebuff/common/util/error'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { cloneDeep } from 'lodash'

import {
  clearAllProposalLedgers,
  clearProposalLedgerForRun,
  getProposalLedger,
} from './tools/handlers/tool/proposal-ledger-store'
import { clearProposedContentForRun } from './tools/handlers/tool/proposed-content-store'
import { executeToolCall } from './tools/tool-executor'
import { parseTextWithToolCalls } from './util/parse-tool-calls-from-text'


import type { FileProcessingState } from './tools/handlers/tool/write-file'
import type { ExecuteToolCallParams } from './tools/tool-executor'
import type { ParsedSegment } from './util/parse-tool-calls-from-text'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type {
  AgentTemplate,
  StepGenerator,
  PublicAgentState,
} from '@codebuff/common/types/agent-template'
import type {
  HandleStepsLogChunkFn,
  SendActionFn,
} from '@codebuff/common/types/contracts/client'
import type { AddAgentStepFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'
import type {
  ToolCallPart,
  ToolResultOutput,
} from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'
// Maintains generator state for all agents. Generator state can't be
// serialized, so we store it in memory. The three pieces of per-run state
// (the cached generator, the STEP_ALL latch, and the owner-agent-id used for
// collision detection) are encapsulated in a single managed registry so the
// module-level state has one explicit lifecycle and one place to audit.
// See C2.4 (per-run context encapsulation).
class AgentRunContextRegistry {
  private readonly runIdToGenerator: Record<string, StepGenerator | undefined> = {}
  private readonly runIdToStepAll: Set<string> = new Set()
  // Tracks which agent instance (agentState.agentId) created the generator
  // cached for a given runId. Used to detect a runId collision between two
  // distinct agent runs (which would otherwise silently resume each other's
  // generator).
  private readonly runIdToOwnerAgentId = new Map<string, string>()

  getGenerator(runId: string): StepGenerator | undefined {
    return this.runIdToGenerator[runId]
  }

  setGenerator(runId: string, generator: StepGenerator, ownerAgentId: string): void {
    this.runIdToGenerator[runId] = generator
    this.runIdToOwnerAgentId.set(runId, ownerAgentId)
  }

  deleteGenerator(runId: string): void {
    delete this.runIdToGenerator[runId]
  }

  getOwnerAgentId(runId: string): string | undefined {
    return this.runIdToOwnerAgentId.get(runId)
  }

  hasStepAll(runId: string): boolean {
    return this.runIdToStepAll.has(runId)
  }

  addStepAll(runId: string): void {
    this.runIdToStepAll.add(runId)
  }

  deleteStepAll(runId: string): void {
    this.runIdToStepAll.delete(runId)
  }

  /** Per-run teardown: drop the generator, STEP_ALL latch, and owner mapping. */
  clearRun(runId: string): void {
    delete this.runIdToGenerator[runId]
    this.runIdToStepAll.delete(runId)
    this.runIdToOwnerAgentId.delete(runId)
  }

  /** Process-wide teardown: drop every run's state. */
  clearAll(): void {
    for (const key in this.runIdToGenerator) {
      delete this.runIdToGenerator[key]
    }
    this.runIdToStepAll.clear()
    this.runIdToOwnerAgentId.clear()
  }
}

const agentRunContextRegistry = new AgentRunContextRegistry()

// Function to clear the generator cache for testing purposes
export function clearAgentGeneratorCache(params: { logger: Logger }) {
  // Drop every run's generator/latch/owner state. Proposed-content and
  // proposal-ledger stores are self-clearing (they expose clearAllProposalLedgers
  // and track their own run keys), so we do not need to iterate the registry's
  // private keys here. Standalone runProgrammaticStep tests do not execute
  // loopAgentSteps' outer finally, which owns proposal-ledger teardown after
  // snapshotting; clearAllProposalLedgers here ensures those direct tests
  // cannot leak run-scoped proposal state.
  clearAllProposalLedgers()
  agentRunContextRegistry.clearAll()
}

/**
 * Clear all in-memory programmatic-step state for a single run: the cached
 * generator, the STEP_ALL latch, and any proposed file content.
 *
 * `runProgrammaticStep` only tears down this state in its own `finally` when
 * the turn ends. But when a generator yields 'STEP'/'STEP_ALL' it is
 * intentionally retained, and control returns to `loopAgentSteps`. If the
 * subsequent LLM step throws (network error, abort, etc.), the run never
 * re-enters `runProgrammaticStep`, so without this the generator/latch/content
 * would leak for the lifetime of the process and a recycled runId could even
 * resume a stale generator. `loopAgentSteps` calls this in a `finally` to
 * guarantee per-run cleanup on every exit path. All operations are idempotent.
 */
export function clearAgentGeneratorForRun(runId: string): void {
  agentRunContextRegistry.clearRun(runId)
  clearProposedContentForRun(runId)
  clearProposalLedgerForRun(runId)
}

// Safety bound on how many tool calls a single handleSteps invocation may
// execute before yielding 'STEP'/'STEP_ALL' or ending. This is far above any
// real generator and exists only to prevent a buggy generator that yields tool
// calls forever from becoming an unbounded infinite loop (the per-LLM-turn
// budget in runAgentStep does not cover the programmatic tool-call loop).
const MAX_PROGRAMMATIC_TOOL_CALLS = 10_000

// Function to handle programmatic agents
export async function runProgrammaticStep(
  params: {
    addAgentStep: AddAgentStepFn
    agentState: AgentState
    clientSessionId: string
    fingerprintId: string
    handleStepsLogChunk: HandleStepsLogChunkFn
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
    nResponses?: string[]
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    prompt: string | undefined
    repoId: string | undefined
    repoUrl: string | undefined
    stepNumber: number
    stepsComplete: boolean
    // True when stepsComplete is due to the step-cap guard (stepsRemaining <= 0).
    // Forwarded to the generator so orchestrators (e.g. base2) can break out
    // instead of falling through to the validation/reviewer gate, which would
    // re-yield STEP and re-trigger the step-cap, causing an infinite loop.
    hitStepCap?: boolean
    template: AgentTemplate
    toolCallParams: Record<string, any> | undefined
    sendAction: SendActionFn
    system: string | undefined
    userId: string | undefined
    userInputId: string
  } & Omit<
    ExecuteToolCallParams,
    | 'toolName'
    | 'input'
    | 'autoInsertEndStepParam'
    | 'excludeToolFromMessageHistory'
    | 'agentContext'
    | 'agentStepId'
    | 'agentTemplate'
    | 'fullResponse'
    | 'previousToolCallFinished'
    | 'fileProcessingState'
    | 'toolCallId'
    | 'toolCalls'
    | 'toolCallsToAddToMessageHistory'
    | 'toolResults'
    | 'toolResultsToAddToMessageHistory'
  > &
    ParamsExcluding<
      AddAgentStepFn,
      | 'agentRunId'
      | 'stepNumber'
      | 'credits'
      | 'childRunIds'
      | 'status'
      | 'startTime'
      | 'messageId'
    >,
): Promise<{
  agentState: AgentState
  endTurn: boolean
  stepNumber: number
  generateN?: number
}> {
  const {
    agentState,
    template,
    clientSessionId: _clientSessionId,
    prompt,
    toolCallParams,
    nResponses,
    system: _system,
    userId: _userId,
    userInputId,
    repoId: _repoId,
    fingerprintId: _fingerprintId,
    onResponseChunk,
    localAgentTemplates: _localAgentTemplates,
    stepsComplete,
    hitStepCap,
    handleStepsLogChunk,
    sendAction,
    addAgentStep,
    logger,
  } = params
  let { stepNumber } = params

  if (!template.handleSteps) {
    throw new Error('No step handler found for agent template ' + template.id)
  }

  if (!agentState.runId) {
    throw new Error('Agent state has no run ID')
  }

  // Run with either a generator or a sandbox.
  let generator = agentRunContextRegistry.getGenerator(agentState.runId)

  // Detect a runId collision: a cached generator for this runId that was
  // created by a *different* agent instance means two overlapping runs share a
  // runId, and we'd be resuming the wrong run's generator. This should never
  // happen if startAgentRun returns globally-unique runIds; warn loudly if it
  // does so the underlying id-generation bug can be found.
  if (generator) {
    const ownerAgentId = agentRunContextRegistry.getOwnerAgentId(agentState.runId)
    if (ownerAgentId !== undefined && ownerAgentId !== agentState.agentId) {
      logger.warn(
        {
          runId: agentState.runId,
          ownerAgentId,
          currentAgentId: agentState.agentId,
          template: template.id,
        },
        'Resuming a programmatic-step generator for a runId owned by a different agent instance; possible runId collision',
      )
    }
  }

  // Check if we need to initialize a generator
  if (!generator) {
    const createLogMethod =
      (level: 'debug' | 'info' | 'warn' | 'error') =>
        (data: any, msg?: string) => {
          logger[level](data, msg) // Log to backend
          handleStepsLogChunk({
            userInputId,
            runId: agentState.runId ?? 'undefined',
            level,
            data,
            message: msg,
          })
        }

    const streamingLogger = {
      debug: createLogMethod('debug'),
      info: createLogMethod('info'),
      warn: createLogMethod('warn'),
      error: createLogMethod('error'),
    }

    // Materialize a stringified handleSteps generator into a callable
    // function. We deliberately use `new Function` instead of direct `eval`:
    //   - `new Function` evaluates in the global scope, so the materialized
    //     generator cannot capture (or mutate) this function's local closure,
    //     which includes `agentState`, `params`, `toolCallParams`, `template`,
    //     and the module-level `agentRunContextRegistry` registry.
    //   - Direct `eval` runs in the enclosing lexical scope and could read or
    //     rewrite those bindings, which is an RCE vector if a template string
    //     is ever loaded from an untrusted source (DB, upload, remote agent
    //     store).
    // This mirrors the serialization convention used by the agent test suite
    // (agents/__tests__/context-pruner.test.ts, base2.test.ts), so the same
    // stringification contract exercised by tests is what runs in prod.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const generatorFn =
      typeof template.handleSteps === 'string'
        ? new Function(`return (${template.handleSteps})`)()
        : template.handleSteps

    // Initialize native generator
    const initializedGenerator = generatorFn({
      agentState,
      prompt,
      params: toolCallParams,
      logger: streamingLogger,
    })
    generator = initializedGenerator
    agentRunContextRegistry.setGenerator(
      agentState.runId,
      initializedGenerator,
      agentState.agentId,
    )
  }

  // Check if we're in STEP_ALL mode
  if (agentRunContextRegistry.hasStepAll(agentState.runId)) {
    if (stepsComplete) {
      // Clear the STEP_ALL mode. Stepping can continue if handleSteps doesn't return.
      agentRunContextRegistry.deleteStepAll(agentState.runId)
    } else {
      return { agentState, endTurn: false, stepNumber }
    }
  }

  const agentStepId = crypto.randomUUID()

  // Initialize state for tool execution
  const toolCalls: CodebuffToolCall[] = []
  const toolResults: ToolMessage[] = []
  // Hydrate cross-turn read authorization from agentState. Each
  // runProgrammaticStep invocation creates a fresh fileProcessingState, so
  // any read auth granted by read_files or write_file in a prior turn would
  // otherwise be lost. The agentState.readAuthorizationsByPath registry
  // survives across LLM turns because agentState is the durable per-run
  // state object.
  const fileProcessingState: FileProcessingState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    failedEditRequiresReadByPath: {},
    consecutiveStrReplaceFailuresByPath: {},
    strictReadBeforeEdit: true,
    readAuthorizationsByPath: { ...(agentState.readAuthorizationsByPath ?? {}) },
  }
  const agentContext = agentState.agentContext

  let toolResult: ToolResultOutput[] | undefined = undefined
  let endTurn = false
  let generateN: number | undefined = undefined
  const pendingProgrammaticContextMessages: Message[] = []
  const addProgrammaticToolResultContext = (message: Message) => {
    pendingProgrammaticContextMessages.push(message)
  }
  const flushProgrammaticToolResultContext = () => {
    if (pendingProgrammaticContextMessages.length === 0) {
      return
    }
    agentState.messageHistory = [
      ...agentState.messageHistory,
      ...pendingProgrammaticContextMessages,
    ]
    pendingProgrammaticContextMessages.length = 0
  }

  let startTime = new Date()
  let creditsBefore = agentState.directCreditsUsed
  let childrenBefore = agentState.childRunIds.length

  let programmaticIterations = 0

  try {
    // Execute tools synchronously as the generator yields them
    do {
      if (programmaticIterations++ >= MAX_PROGRAMMATIC_TOOL_CALLS) {
        throw new Error(
          `handleSteps for agent ${template.id} exceeded ${MAX_PROGRAMMATIC_TOOL_CALLS} iterations ` +
            `without yielding STEP/STEP_ALL or ending; aborting to prevent an infinite loop`,
        )
      }

      startTime = new Date()
      creditsBefore = agentState.directCreditsUsed
      childrenBefore = agentState.childRunIds.length

      const result = generator!.next({
        agentState: getPublicAgentState(
          agentState as AgentState & Required<Pick<AgentState, 'runId'>>,
        ),
        toolResult: toolResult ?? [],
        stepsComplete,
        hitStepCap,
        nResponses,
      })

      if (result.done) {
        endTurn = true
        break
      }

      // Validate the yield value from handleSteps
      const parseResult = HandleStepsYieldValueSchema.safeParse(result.value)
      if (!parseResult.success) {
        throw new Error(
          `Invalid yield value from handleSteps in agent ${template.id}: ${parseResult.error.message}. ` +
          `Received: ${JSON.stringify(result.value)}`,
        )
      }

      if (result.value === 'STEP') {
        flushProgrammaticToolResultContext()
        break
      }
      if (result.value === 'STEP_ALL') {
        agentRunContextRegistry.addStepAll(agentState.runId)
        flushProgrammaticToolResultContext()
        break
      }

      if ('type' in result.value && result.value.type === 'STEP_TEXT') {
        // Parse text and tool calls, preserving interleaved order
        const segments = parseTextWithToolCalls(result.value.text)

        if (segments.length > 0) {
          // Execute segments (text and tool calls) in order
          toolResult = await executeSegmentsArray(segments, {
            ...params,
            agentContext,
            agentStepId,
            agentTemplate: template,
            agentState,
            fileProcessingState,
            fullResponse: '',
            previousToolCallFinished: Promise.resolve(),
            toolCalls,
            toolResults,
            addProgrammaticToolResultContext,
            onResponseChunk,
          })
        }
        continue
      }

      if ('type' in result.value && result.value.type === 'GENERATE_N') {
        logger.info({ resultValue: result.value }, 'GENERATE_N yielded')
        // Handle GENERATE_N: generate n responses using the LLM
        generateN = result.value.n
        endTurn = false
        flushProgrammaticToolResultContext()
        break
      }

      // Process tool calls yielded by the generator
      const toolCall = result.value as ToolCallToExecute

      toolResult = await executeSingleToolCall(toolCall, {
        ...params,
        agentContext,
        agentStepId,
        agentTemplate: template,
        agentState,
        fileProcessingState,
        fullResponse: '',
        previousToolCallFinished: Promise.resolve(),
        toolCalls,
        toolResults,
        addProgrammaticToolResultContext,
        onResponseChunk,
      })

      if (agentState.runId) {
        await addAgentStep({
          ...params,
          agentRunId: agentState.runId,
          stepNumber,
          credits: agentState.directCreditsUsed - creditsBefore,
          childRunIds: agentState.childRunIds.slice(childrenBefore),
          status: 'completed',
          startTime,
          messageId: null,
        })
      } else {
        logger.error('No runId found for agent state after finishing agent run')
      }
      stepNumber++

      if (toolCall.toolName === 'end_turn') {
        endTurn = true
        break
      }
    } while (true)

    return {
      agentState,
      endTurn,
      stepNumber,
      generateN,
    }
  } catch (error) {
    endTurn = true

    const errorMessage = `Error executing handleSteps for agent ${template.id}: ${error instanceof Error ? error.message : 'Unknown error'
      }`
    logger.error(
      { error: getErrorObject(error), template: template.id },
      errorMessage,
    )

    onResponseChunk(errorMessage)

    // Recreate the array rather than push in place: messageHistory is treated
    // as readonly elsewhere in this file, and mutating it can break referential
    // change detection for callers holding the same reference.
    agentState.messageHistory = [
      ...agentState.messageHistory,
      assistantMessage(errorMessage),
    ]
    // Spread is undefined-safe and preserves any already-set output fields
    // while recording the error.
    agentState.output = {
      ...agentState.output,
      error: errorMessage,
    }

    if (agentState.runId) {
      await addAgentStep({
        ...params,
        agentRunId: agentState.runId,
        stepNumber,
        credits: agentState.directCreditsUsed - creditsBefore,
        childRunIds: agentState.childRunIds.slice(childrenBefore),
        status: 'skipped',
        startTime,
        errorMessage,
        messageId: null,
        logger,
      })
    } else {
      logger.error('No runId found for agent state after failed agent run')
    }
    stepNumber++

    return {
      agentState,
      endTurn,
      stepNumber,
      generateN: undefined,
    }
  } finally {
    // Write back cross-turn read authorization. Any path that read_files or
    // write_file granted auth on during this programmatic step must be
    // persisted on agentState so the next runProgrammaticStep invocation
    // (or the next processStream call) can hydrate it. Running in finally
    // ensures the write-back fires on both the success and the error paths,
    // so a successful read_files followed by a downstream error still
    // carries its auth to the next turn. The read-back half of the fix
    // is the hydration in the fileProcessingState initializer above.
    if (!agentState.readAuthorizationsByPath) {
      agentState.readAuthorizationsByPath = {}
    }
    for (const [authPath, auth] of Object.entries(
      fileProcessingState.readAuthorizationsByPath ?? {},
    )) {
      if (auth) {
        agentState.readAuthorizationsByPath[authPath] = true
      }
    }

    if (endTurn) {
      agentRunContextRegistry.clearRun(agentState.runId)
      clearProposedContentForRun(agentState.runId)
      // NOTE: Do NOT clear the proposal ledger here. This inner finally runs on
      // the endTurn step *during* loopAgentSteps' loop, i.e. before that outer
      // run snapshots the ledger for subagent proposal recovery. Clearing it
      // here emptied the ledger before the snapshot, which is exactly the
      // "diffs generated, then proposal shows no changes" bug: the child
      // completed, the transient diff tool-result was shown, but the
      // recoverable artifacts were already gone. loopAgentSteps' outer finally
      // is the single owner of ledger teardown (via clearAgentGeneratorForRun)
      // and snapshots it first, so the artifacts survive across the boundary.
    }
  }
}

export const getPublicAgentState = (
  agentState: AgentState & Required<Pick<AgentState, 'runId'>>,
): PublicAgentState => {
  const {
    agentId,
    runId,
    parentId,
    messageHistory,
    output,
    systemPrompt,
    toolDefinitions,
    contextTokenCount,
  } = agentState
  return {
    agentId,
    runId,
    parentId,
    messageHistory: messageHistory as any as PublicAgentState['messageHistory'],
    output,
    systemPrompt,
    toolDefinitions,
    contextTokenCount,
    // Surface the deterministic proposal ledger so programmatic agents (the
    // best-of-N implementor) finalize their bundle from recorded artifacts
    // instead of scanning mutable message history.
    proposalLedger: getProposalLedger(runId),
  }
}

/**
 * Represents a tool call to be executed.
 * Programmatic tool calls are not model-generated tool calls. By default their
 * results are recorded as provider-neutral user context. Use
 * `includeToolCall: true` only when the target provider can accept synthetic
 * assistant tool calls in prompt history.
 */
type ToolCallToExecute = {
  toolName: string
  input: Record<string, unknown>
  includeToolCall?: boolean
}

const PROGRAMMATIC_CONTEXT_MANAGEMENT_TOOLS = new Set([
  'add_message',
  'set_messages',
  'set_output',
  'end_turn',
])

function formatProgrammaticToolResultMessage(params: {
  toolName: string
  input: Record<string, unknown>
  toolResult: ToolResultOutput[]
}): string {
  const resultText = params.toolResult
    .map((result) => {
      if (result.type === 'json') {
        return JSON.stringify(result.value, null, 2)
      }
      if (result.type === 'media') {
        return `[media result: ${result.mediaType}, ${result.data.length} bytes]`
      }
      result satisfies never
      return ''
    })
    .filter(Boolean)
    .join('\n\n')

  return [
    '<programmatic_tool_result>',
    `Tool: ${params.toolName}`,
    '',
    'Input JSON:',
    JSON.stringify(params.input, null, 2),
    '',
    'Output:',
    resultText || '(no output)',
    '</programmatic_tool_result>',
  ].join('\n')
}

/**
 * Parameters for executing an array of tool calls.
 */
type ExecuteToolCallsArrayParams = Omit<
  ExecuteToolCallParams,
  | 'toolName'
  | 'input'
  | 'autoInsertEndStepParam'
  | 'excludeToolFromMessageHistory'
  | 'toolCallId'
  | 'toolCallsToAddToMessageHistory'
  | 'toolResultsToAddToMessageHistory'
> & {
  agentState: AgentState
  addProgrammaticToolResultContext?: (message: Message) => void
  onResponseChunk: (chunk: string | PrintModeEvent) => void
}

/**
 * Executes a single tool call.
 * Adds provider-native tool-call history only for explicit opt-in calls.
 *
 * @returns The tool result from the executed tool call.
 */
async function executeSingleToolCall(
  toolCallToExecute: ToolCallToExecute,
  params: ExecuteToolCallsArrayParams,
): Promise<ToolResultOutput[] | undefined> {
  const {
    addProgrammaticToolResultContext,
    agentState,
    onResponseChunk,
    toolResults,
  } = params

  // Note: We don't check if the tool is available for the agent template anymore.
  // You can run any tool from handleSteps now!
  // if (!template.toolNames.includes(toolCall.toolName)) {
  //   throw new Error(
  //     `Tool ${toolCall.toolName} is not available for agent ${template.id}. Available tools: ${template.toolNames.join(', ')}`,
  //   )
  // }

  const toolCallId = crypto.randomUUID()
  const includeStructuredToolCall =
    toolCallToExecute.includeToolCall === true
  const excludeToolFromMessageHistory = !includeStructuredToolCall

  // Add assistant message with the tool call before executing it
  if (!excludeToolFromMessageHistory) {
    const toolCallPart: ToolCallPart = {
      type: 'tool-call',
      toolCallId,
      toolName: toolCallToExecute.toolName,
      input: toolCallToExecute.input,
    }
    // onResponseChunk({
    //   ...toolCallPart,
    //   type: 'tool_call',
    //   agentId: agentState.agentId,
    //   parentAgentId: agentState.parentId,
    // })
    // NOTE(James): agentState.messageHistory is readonly for some reason (?!). Recreating the array is a workaround.
    agentState.messageHistory = [...agentState.messageHistory]
    agentState.messageHistory.push(assistantMessage(toolCallPart))
    // Optional call handles both top-level and nested agents
    // sendSubagentChunk({
    //   userInputId,
    //   agentId: agentState.agentId,
    //   agentType: agentState.agentType!,
    //   chunk: toolCallString,
    //   forwardToPrompt: !agentState.parentId,
    // })
  }

  const toolResultsToAddToMessageHistory: ToolMessage[] = []
  // Execute the tool call
  await executeToolCall({
    ...params,
    toolName: toolCallToExecute.toolName as any,
    input: toolCallToExecute.input,
    autoInsertEndStepParam: true,
    excludeToolFromMessageHistory,
    fromHandleSteps: true,
    toolCallId,
    toolCalls: [],
    toolCallsToAddToMessageHistory: [],
    toolResultsToAddToMessageHistory,

    onResponseChunk: (chunk: string | PrintModeEvent) => {
      if (typeof chunk === 'string') {
        onResponseChunk(chunk)
        return
      }
      let chunkForClient = chunk
      if (
        chunk.type === 'tool_call' &&
        toolCallToExecute.includeToolCall === undefined &&
        chunk.includeToolCall === false
      ) {
        const { includeToolCall: _includeToolCall, ...rest } = chunk
        chunkForClient = rest
      }

      // Add lineage to nested programmatic events so the CLI can attach them
      // to the correct child agent block. Subagents spawned by this agent are
      // parented under the current agent; this agent's own tool calls/results
      // are parented under its real parent.
      if (agentState.parentId) {
        const childSubagentParentId = agentState.agentId
        const toolEventParentId = agentState.parentId

        switch (chunkForClient.type) {
          case 'subagent_start':
          case 'subagent_finish':
            if (!chunkForClient.parentAgentId) {
              onResponseChunk({
                ...chunkForClient,
                parentAgentId: childSubagentParentId,
              })
              return
            }
            break
          case 'tool_call':
          case 'tool_result': {
            if (
              !chunkForClient.parentAgentId ||
              !('agentId' in chunkForClient) ||
              !chunkForClient.agentId
            ) {
              onResponseChunk({
                ...chunkForClient,
                agentId:
                  'agentId' in chunkForClient && chunkForClient.agentId
                    ? chunkForClient.agentId
                    : agentState.agentId,
                parentAgentId: chunkForClient.parentAgentId ?? toolEventParentId,
              })
              return
            }
            break
          }
          default:
            break
        }
      }

      // For other events or top-level spawns, send as-is
      onResponseChunk(chunkForClient)
    },
  })

  agentState.messageHistory = [...agentState.messageHistory]
  agentState.messageHistory.push(...toolResultsToAddToMessageHistory)

  // Get the latest tool result
  const latestToolResult = toolResults[toolResults.length - 1]?.content

  if (
    toolCallToExecute.includeToolCall === undefined &&
    latestToolResult &&
    !PROGRAMMATIC_CONTEXT_MANAGEMENT_TOOLS.has(toolCallToExecute.toolName)
  ) {
    addProgrammaticToolResultContext?.(
      userMessage(
        formatProgrammaticToolResultMessage({
          toolName: toolCallToExecute.toolName,
          input: toolCallToExecute.input,
          toolResult: latestToolResult,
        }),
      ),
    )
  }

  return latestToolResult
}

/**
 * Executes an array of segments (text and tool calls) sequentially.
 * Text segments are added as assistant messages.
 * Tool calls are added as assistant messages and then executed.
 *
 * @returns The tool result from the last executed tool call.
 */
async function executeSegmentsArray(
  segments: ParsedSegment[],
  params: ExecuteToolCallsArrayParams,
): Promise<ToolResultOutput[] | undefined> {
  const { agentState, onResponseChunk } = params

  let toolResults: ToolResultOutput[] = []

  for (const segment of segments) {
    if (segment.type === 'text') {
      // Add text as an assistant message
      agentState.messageHistory = [...agentState.messageHistory]
      agentState.messageHistory.push(assistantMessage(segment.text))

      // Stream assistant text
      onResponseChunk(segment.text)
    } else {
      // Handle tool call segment
      const toolResult = await executeSingleToolCall(segment, params)
      if (toolResult) {
        toolResults.push(...toolResult)
      }
    }
  }

  return toolResults
}
