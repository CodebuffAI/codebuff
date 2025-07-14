import { ProgrammaticAgentContext, ProgrammaticAgentFunction } from '../types'
import { CodebuffToolCall } from '../../../../tools/constants'

// Example generator function that can be loaded from a file
const exampleHandler: ProgrammaticAgentFunction = function* (
  context: ProgrammaticAgentContext
) {
  // This is a simple example that just returns a greeting
  const greeting = `Hello! You said: "${context.prompt}"`

  const toolCall: Omit<CodebuffToolCall<'update_report'>, 'toolCallId'> = {
    type: 'tool-call',
    toolName: 'update_report',
    args: {
      json_update: {
        greeting,
        timestamp: new Date().toISOString(),
        params: context.params,
      },
    },
  }

  yield toolCall
}

// Export as default for easy loading
export default exampleHandler
export { exampleHandler }
