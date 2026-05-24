import type { ComposioMetaToolName } from '@codebuff/common/constants/composio'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'

function makeComposioHandler<
  T extends ComposioMetaToolName,
>(): CodebuffToolHandlerFunction<T> {
  return async ({ toolCall, requestClientToolCall }) => {
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
  }
}

export const handleComposioManageConnections: CodebuffToolHandlerFunction<'COMPOSIO_MANAGE_CONNECTIONS'> =
  makeComposioHandler<'COMPOSIO_MANAGE_CONNECTIONS'>()
export const handleComposioMultiExecute: CodebuffToolHandlerFunction<'COMPOSIO_MULTI_EXECUTE_TOOL'> =
  makeComposioHandler<'COMPOSIO_MULTI_EXECUTE_TOOL'>()
export const handleComposioSearchTools: CodebuffToolHandlerFunction<'COMPOSIO_SEARCH_TOOLS'> =
  makeComposioHandler<'COMPOSIO_SEARCH_TOOLS'>()
export const handleComposioGetToolSchemas: CodebuffToolHandlerFunction<'COMPOSIO_GET_TOOL_SCHEMAS'> =
  makeComposioHandler<'COMPOSIO_GET_TOOL_SCHEMAS'>()
