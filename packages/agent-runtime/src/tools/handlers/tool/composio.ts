import type { ComposioMetaToolName } from '@codebuff/common/constants/composio'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'

function makeComposioHandler<T extends ComposioMetaToolName>() {
  return (async ({ toolCall, requestClientToolCall }) => {
    if (!requestClientToolCall) {
      return {
        output: [
          {
            type: 'json',
            value: {
              errorMessage: 'Composio tools are not available in this runtime.',
            },
          },
        ],
      }
    }

    return {
      output: (await (requestClientToolCall as any)(
        toolCall,
      )) as CodebuffToolOutput<T>,
    }
  }) satisfies CodebuffToolHandlerFunction<T>
}

export const handleComposioManageConnections =
  makeComposioHandler<'COMPOSIO_MANAGE_CONNECTIONS'>()
export const handleComposioMultiExecute =
  makeComposioHandler<'COMPOSIO_MULTI_EXECUTE_TOOL'>()
export const handleComposioSearchTools =
  makeComposioHandler<'COMPOSIO_SEARCH_TOOLS'>()
export const handleComposioGetToolSchemas =
  makeComposioHandler<'COMPOSIO_GET_TOOL_SCHEMAS'>()
