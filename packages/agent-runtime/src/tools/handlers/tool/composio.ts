import type { ComposioMetaToolName } from '@codebirds/common/constants/composio'
import type { CodebirdsToolOutput } from '@codebirds/common/tools/list'
import type { CodebirdsToolHandlerFunction } from '../handler-function-type'

function makeComposioHandler<
  T extends ComposioMetaToolName,
>(): CodebirdsToolHandlerFunction<T> {
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
      )) as CodebirdsToolOutput<T>,
    }
  }
}

export const handleComposioManageConnections: CodebirdsToolHandlerFunction<'composio_manage_connections'> =
  makeComposioHandler<'composio_manage_connections'>()
export const handleComposioMultiExecute: CodebirdsToolHandlerFunction<'composio_multi_execute_tool'> =
  makeComposioHandler<'composio_multi_execute_tool'>()
export const handleComposioSearchTools: CodebirdsToolHandlerFunction<'composio_search_tools'> =
  makeComposioHandler<'composio_search_tools'>()
export const handleComposioGetToolSchemas: CodebirdsToolHandlerFunction<'composio_get_tool_schemas'> =
  makeComposioHandler<'composio_get_tool_schemas'>()
