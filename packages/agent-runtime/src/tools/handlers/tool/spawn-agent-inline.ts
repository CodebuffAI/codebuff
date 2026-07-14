import { isEqual, mapValues } from 'lodash'

import {
  validateAndGetAgentTemplate,
  validateAgentInput,
  executeSubagent,
  createAgentState,
  extractSubagentContextParams,
  buildSpawnParamsWithHandoff,
  normalizeSpawnedAgentOutput,
} from './spawn-agent-utils'

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
  const runtimeSpawnParams = buildSpawnParamsWithHandoff({
    agentType,
    handoff,
    spawnParams,
  })

  // Override template for inline agent to share system prompt & message history with parent
  const inlineTemplate = {
    ...agentTemplate,
    includeMessageHistory: true,
    inheritParentSystemPrompt: true,
  }

  // Create child agent state that shares message history with parent
  const childAgentState: AgentState = {
    ...createAgentState(
      agentType,
      inlineTemplate,
      parentAgentState,
      parentAgentState.agentContext,
    ),
    systemPrompt: system,
    toolDefinitions: mapValues(parentTools, (tool) => ({
      description: tool.description,
      inputSchema: tool.inputSchema as {},
    })),
  }
  const inheritedParentHistory = childAgentState.messageHistory.slice(0, -1)

  // Extract common context params to avoid bugs from spreading all params
  const contextParams = extractSubagentContextParams(params)

  const result = await executeSubagent({
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

  // Ordinary inline agents append private reads, tool results, and output to
  // the inherited history. Do not copy that append-only child transcript back
  // into the orchestrator; return only the final result below. A programmatic
  // history editor (notably context-pruner) may intentionally delete, reorder,
  // or rewrite inherited messages via set_messages. Detect that control-plane
  // mutation by checking the inherited prefix and propagate only then.
  const inheritedPrefixPreserved = inheritedParentHistory.every(
    (message, index) =>
      index < result.agentState.messageHistory.length &&
      isEqual(result.agentState.messageHistory[index], message),
  )
  if (agentType === 'context-pruner' || !inheritedPrefixPreserved) {
    parentAgentState.messageHistory = result.agentState.messageHistory
  }

  return {
    output: [
      {
        type: 'json',
        value: normalizeSpawnedAgentOutput(result.output, agentType) ?? {
          message: 'Agent completed without structured output.',
        },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
