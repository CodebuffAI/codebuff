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

export const handleComposioManageConnections: CodebuffToolHandlerFunction<'composio_manage_connections'> =
  makeComposioHandler<'composio_manage_connections'>()
export const handleComposioMultiExecute: CodebuffToolHandlerFunction<'composio_multi_execute_tool'> =
  makeComposioHandler<'composio_multi_execute_tool'>()
export const handleComposioSearchTools: CodebuffToolHandlerFunction<'composio_search_tools'> =
  makeComposioHandler<'composio_search_tools'>()
export const handleComposioGetToolSchemas: CodebuffToolHandlerFunction<'composio_get_tool_schemas'> =
  makeComposioHandler<'composio_get_tool_schemas'>()
