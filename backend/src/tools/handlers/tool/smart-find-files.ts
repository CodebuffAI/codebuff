import { smartFindFiles } from '../../definitions/tool/smart-find-files'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleSmartFindFiles = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'smart_find_files'>
  state: any
}): {
  result: Promise<CodebuffToolOutput<'smart_find_files'>>
  state: any
} => {
  const { previousToolCallFinished, toolCall } = params

  return {
    result: (async () => {
      await previousToolCallFinished
      
      try {
        // Mock project context - in real implementation this would come from the session
        const projectContext = {
          // This would be populated from the enhanced project context analysis
        }
        
        const result = await smartFindFiles(toolCall.input, projectContext)
        
        return [
          {
            type: 'json',
            value: {
              ...result,
              files: result.files.map(file => ({
                ...file,
                lastModified: file.lastModified.toISOString()
              })),
              message: `Found ${result.files.length} relevant files using strategy: ${result.searchStrategy}`,
            },
          },
        ]
      } catch (error) {
        return [
          {
            type: 'json',
            value: {
              files: [],
              searchStrategy: 'error',
              totalFound: 0,
              searchTimeMs: 0,
              suggestions: [`Error during file search: ${error instanceof Error ? error.message : 'Unknown error'}`],
              message: `File search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          },
        ]
      }
    })(),
    state: params.state,
  }
}) satisfies CodebuffToolHandlerFunction<'smart_find_files'>
