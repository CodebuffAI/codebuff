import {
  validateAndGetAgentTemplate,
  validateAgentInput,
  logAgentSpawn,
  executeSubagent,
  createAgentState,
} from './spawn-agent-utils'
import { validateToolHandler } from '../handler-function-type'

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

type ToolName = 'spawn_agent_inline'
export const handleSpawnAgentInline = validateToolHandler<ToolName>(
  async (
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
      userInputId,
      writeToClient,
    } = params
    const {
      agent_type: agentTypeStr,
      prompt,
      params: spawnParams,
    } = toolCall.input

    await previousToolCallFinished

    const { agentTemplate, agentType } = await validateAndGetAgentTemplate({
      ...params,
      agentTypeStr,
      parentAgentTemplate,
    })

    validateAgentInput(agentTemplate, agentType, prompt, spawnParams)

    // Create child agent state that shares message history with parent
    const childAgentState: AgentState = createAgentState(
      agentType,
      agentTemplate,
      parentAgentState,
      parentAgentState.agentContext,
    )

    logAgentSpawn({
      ...params,
      agentTemplate,
      agentType,
      agentId: childAgentState.agentId,
      parentId: childAgentState.parentId,
      prompt,
      spawnParams,
      inline: true,
    })

    const result = await executeSubagent({
      ...params,
      userInputId: `${userInputId}-inline-${agentType}${childAgentState.agentId}`,
      prompt: prompt || '',
      spawnParams,
      agentTemplate,
      parentAgentState,
      agentState: childAgentState,
      fingerprintId,
      parentSystemPrompt: system,
      onResponseChunk: (chunk) => {
        // Inherits parent's onResponseChunk, except for context-pruner (TODO: add an option for it to be silent?)
        if (agentType !== 'context-pruner') {
          writeToClient(chunk)
        }
      },
      clearUserPromptMessagesAfterResponse: false,
    })

    // Update parent agent state to reflect shared message history
    parentAgentState.messageHistory = result.agentState.messageHistory

    return { output: [] }
  },
)
