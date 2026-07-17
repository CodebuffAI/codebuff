import { mapValues } from 'lodash'

import {
  validateAndGetAgentTemplate,
  validateAgentInput,
  executeSubagent,
  createAgentState,
  extractSubagentContextParams,
  buildSpawnParamsWithHandoff,
  deriveSpawnTemplateCapabilities,
  validateVersionedAgentHandoff,
  normalizeSpawnedAgentOutput,
  buildRuntimeAgentReceipt,
  reconcileAgentReceiptIntoParent,
} from './spawn-agent-utils'
import { appendOrchestrationEvent } from '../../../util/orchestration-ledger'
import { selectAgentAttempt } from '../../../orchestration/select-agent-attempt'
import {
  acquireWorkspacePathLease,
  releaseWorkspacePathLease,
} from '../../../util/workspace-path-leases'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolSet } from 'ai'

type ToolName = 'spawn_agent_inline'
export const handleSpawnAgentInline = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    agentState: AgentState
    agentTemplate: AgentTemplate
    clientSessionId: string
    fileContext: ProjectFileContext
    fingerprintId: string
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
    system: string
    tools: ToolSet
    userId: string | undefined
    userInputId: string
    writeToClient: (chunk: string | PrintModeEvent) => void
  } & ParamsExcluding<
    typeof executeSubagent,
    | 'userInputId'
    | 'prompt'
    | 'spawnParams'
    | 'agentTemplate'
    | 'parentAgentState'
    | 'agentState'
    | 'parentSystemPrompt'
    | 'parentTools'
    | 'onResponseChunk'
    | 'clearUserPromptMessagesAfterResponse'
    | 'fingerprintId'
  >,
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentState: parentAgentState,
    agentTemplate: parentAgentTemplate,
    fingerprintId,
    system,
    tools: parentTools,
    userInputId,
    writeToClient,
    logger,
  } = params
  const {
    agent_type: agentTypeStr,
    prompt,
    params: spawnParams,
    handoff,
  } = toolCall.input

  await previousToolCallFinished

  const { agentTemplate, agentType } = await validateAndGetAgentTemplate({
    agentTypeStr,
    parentAgentTemplate,
    localAgentTemplates: params.localAgentTemplates,
    logger,
    fetchAgentFromDatabase: params.fetchAgentFromDatabase,
    databaseAgentCache: params.databaseAgentCache,
    apiKey: params.apiKey,
  })

  validateAgentInput(agentTemplate, agentType, prompt, spawnParams)
  validateVersionedAgentHandoff({ agentType, handoff })
  const effectiveAgentTemplate = deriveSpawnTemplateCapabilities({
    agentTemplate,
    parentAgentTemplate,
    handoff,
    projectRoot: params.fileContext.projectRoot,
  })
  const contextWindowTokens = params.resolveModelContextWindow?.({
    agentId: effectiveAgentTemplate.id,
    model: effectiveAgentTemplate.model,
  })
  const selection = selectAgentAttempt({
    candidates: [
      {
        template: effectiveAgentTemplate,
        contextWindowTokens,
        explicitRoute: true,
      },
    ],
    requiredTools: handoff?.permissions.allowedTools ?? [],
    requiredWritablePaths: handoff?.permissions.writablePaths ?? [],
    minimumContextTokens:
      contextWindowTokens === undefined
        ? undefined
        : Math.max(
            2_048,
            Math.ceil(
              ((handoff ? JSON.stringify(handoff).length : 0) +
                (prompt?.length ?? 0)) /
                2,
            ),
          ),
    // Inline work is foreground and does not consume a background-agent slot.
    runningForRoot: 0,
    maxRunningForRoot: 8,
  })
  const runtimeSpawnParams = buildSpawnParamsWithHandoff({
    agentType,
    handoff,
    spawnParams,
  })

  // Inline context editors need the full parent transcript, but ordinary inline
  // specialists receive only bounded pinned operational memory by default.
  // This keeps each child's model window independent and avoids duplicating the
  // parent's system/tool baseline unless the child explicitly opts in.
  const editsParentMessageHistory =
    agentType === 'context-pruner' ||
    effectiveAgentTemplate.propagateMessageHistoryChanges === true
  const inlineMessageHistoryMode = editsParentMessageHistory
    ? 'full'
    : (effectiveAgentTemplate.messageHistoryMode ?? 'pinned')
  const inlineTemplate = {
    ...selection.candidate.template,
    includeMessageHistory: inlineMessageHistoryMode !== 'none',
    messageHistoryMode: inlineMessageHistoryMode,
    inheritParentSystemPrompt:
      agentType === 'context-pruner'
        ? true
        : effectiveAgentTemplate.inheritParentSystemPrompt,
  }

  // Create an isolated child state with the selected bounded transfer mode.
  const childAgentState: AgentState = {
    ...createAgentState(agentType, inlineTemplate, parentAgentState, {}),
    ...(inlineTemplate.inheritParentSystemPrompt
      ? {
          systemPrompt: system,
          toolDefinitions: mapValues(parentTools, (tool) => ({
            description: tool.description,
            inputSchema: tool.inputSchema as {},
          })),
        }
      : {}),
  }
  appendOrchestrationEvent({
    state: parentAgentState,
    event: {
      type: 'spawn_started',
      runId: parentAgentState.runId ?? parentAgentState.agentId,
      spawnId: childAgentState.agentId,
      taskId: handoff?.taskId,
      agentType,
      parentRunId: parentAgentState.runId ?? parentAgentState.agentId,
      capabilityId: selection.capabilityId,
      workspaceRevision: parentAgentState.workspaceState?.revision,
      workspaceSnapshotId: parentAgentState.workspaceState?.snapshotId,
    },
  })
  const leaseId = acquireWorkspacePathLease({
    state: parentAgentState,
    projectRoot: params.fileContext.projectRoot,
    ownerAgentId: childAgentState.agentId,
    taskId: handoff?.taskId,
    paths: handoff?.permissions.writablePaths ?? [],
  })
  // Extract common context params to avoid bugs from spreading all params
  const contextParams = extractSubagentContextParams(params)

  let result: Awaited<ReturnType<typeof executeSubagent>>
  try {
    result = await executeSubagent({
      ...contextParams,

      // Spawn-specific params
      ancestorRunIds: parentAgentState.ancestorRunIds,
      userInputId: `${userInputId}-inline-${agentType}${childAgentState.agentId}`,
      prompt: prompt || '',
      spawnParams: runtimeSpawnParams,
      agentTemplate: inlineTemplate,
      parentAgentState,
      agentState: childAgentState,
      fingerprintId,
      spawnToolCallId: toolCall.toolCallId,
      spawnIndex: 0,
      parentSystemPrompt: system,
      parentTools,
      onResponseChunk: (chunk: string | PrintModeEvent) => {
        // Inherits parent's onResponseChunk, except for context-pruner (TODO: add an option for it to be silent?)
        if (agentType !== 'context-pruner') {
          if (typeof chunk === 'string') {
            writeToClient(chunk)
            return
          }

          // Tag child text events with the child's agentId so prose attributes to
          // the child block in the TUI (matches spawn_agents' text branch).
          // Preserve a pre-existing agentId (set by run-programmatic-step for
          // grandchild spawns) so deep inline nesting keeps correct text
          // attribution; fall back to the child's agentId for direct inline children.
          if (chunk.type === 'text') {
            if (chunk.text) {
              writeToClient({
                type: 'text',
                agentId: chunk.agentId ?? childAgentState.agentId,
                text: chunk.text,
              })
            }
            return
          }

          // Add parentAgentId for proper nesting in UI
          const ensureParentAgentId = (): string | undefined => {
            if (
              chunk.type === 'subagent_start' ||
              chunk.type === 'subagent_finish'
            ) {
              return chunk.parentAgentId ?? parentAgentState.agentId
            }
            if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
              // Tool events nest inside the child's own agent block. Preserve a
              // pre-existing parentAgentId (set by run-programmatic-step for
              // grandchild spawns) so deep inline nesting keeps correct lineage;
              // fall back to the child's agentId for direct inline children.
              return chunk.parentAgentId ?? childAgentState.agentId
            }
            return undefined
          }

          const parentAgentId = ensureParentAgentId()
          if (
            parentAgentId !== undefined &&
            (chunk.type === 'subagent_start' ||
              chunk.type === 'subagent_finish' ||
              chunk.type === 'tool_call' ||
              chunk.type === 'tool_result')
          ) {
            writeToClient({ ...chunk, parentAgentId })
            return
          }

          writeToClient(chunk)
        }
      },
      clearUserPromptMessagesAfterResponse: false,
    })
  } catch (error) {
    releaseWorkspacePathLease(parentAgentState, leaseId)
    throw error
  }

  // Ordinary inline agents never write their private transcript back into the
  // parent. Only explicit history-editor templates may propagate replacements.
  if (editsParentMessageHistory) {
    parentAgentState.messageHistory = result.agentState.messageHistory
  }
  const receipt = buildRuntimeAgentReceipt({
    agentType,
    agentId: result.agentState.agentId,
    handoff,
    spawnParams: runtimeSpawnParams,
    output: result.output,
    agentState: result.agentState,
  })
  reconcileAgentReceiptIntoParent({
    parentAgentState,
    receipt,
    agentType,
    objective: handoff?.objective,
  })
  releaseWorkspacePathLease(parentAgentState, leaseId)

  return {
    output: [
      {
        type: 'json',
        value: {
          result: normalizeSpawnedAgentOutput(result.output, agentType) ?? {
            message: 'Agent completed without structured output.',
          },
          agentReceipt: receipt,
        },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
