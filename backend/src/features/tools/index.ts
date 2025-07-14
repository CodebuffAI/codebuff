// Tools feature exports
export { codebuffToolDefs } from './constants'
export type { CodebuffToolCall, ClientToolCall, CodebuffToolHandlerFunction } from './constants'
export * from './definitions'
export * from './handlers'

// Re-export tool functions from the legacy tools.ts file
// This provides a bridge during the migration to the new structure
export {
  parseRawToolCall,
  toolParams,
  updateContextFromToolCalls,
  getShortToolInstructions,
  getToolsInstructions,
  getFilteredToolsInstructions,
  type ToolCallError
} from '../../tools'
