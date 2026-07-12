import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'

export const handleBrowserLogs = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'browser_logs'>
  agentTemplate: AgentTemplate
  spawnParams?: Record<string, any>
  requestClientToolCall: (
    toolCall: ClientToolCall<'browser_logs'>,
  ) => Promise<CodebuffToolOutput<'browser_logs'>>
}): Promise<{
  output: CodebuffToolOutput<'browser_logs'>
}> => {
  const {
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    agentTemplate,
    spawnParams,
  } = params

  await previousToolCallFinished
  const actionType = toolCall.input.type
  const readOnlyBrowserActions = new Set([
    'start',
    'navigate',
    'snapshot',
    'screenshot',
    'pixel_diff',
    'pdf',
    'diagnose',
    'wait_for',
    'stop',
  ])
  const isReadOnlyAction = (action: Record<string, any>): boolean => {
    if (!readOnlyBrowserActions.has(action.type)) return false
    if (action.type !== 'diagnose') return true
    return (
      Array.isArray(action.steps) &&
      action.steps.every(
        (step: Record<string, any>) =>
          step &&
          typeof step === 'object' &&
          step.action &&
          typeof step.action === 'object' &&
          isReadOnlyAction(step.action),
      )
    )
  }
  if (
    agentTemplate.id === 'browser-use' &&
    spawnParams?.interactionPolicy !== 'allow-interactions' &&
    !isReadOnlyAction(toolCall.input as Record<string, any>)
  ) {
    return {
      output: [
        {
          type: 'json',
          value: {
            success: false,
            action: actionType,
            error:
              'Browser interaction denied by the read-only interactionPolicy. Spawn browser-use with params.interactionPolicy="allow-interactions" after user authorization.',
            logs: [],
          },
        },
      ],
    }
  }
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebuffToolHandlerFunction<'browser_logs'>
