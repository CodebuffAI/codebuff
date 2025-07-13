import { ProgrammaticAgentContext, ProgrammaticAgentFunction } from '../types'

// Example generator function that can be loaded from a file
const exampleHandler: ProgrammaticAgentFunction = function* (
  context: ProgrammaticAgentContext
) {
  // This is a simple example that just returns a greeting
  const greeting = `Hello! You said: "${context.prompt}"`

  yield {
    toolName: 'update_report' as const,
    args: {
      json_update: {
        greeting,
        timestamp: new Date().toISOString(),
        params: context.params,
      },
    },
  }
}

// Export as default for easy loading
export default exampleHandler
export { exampleHandler }
