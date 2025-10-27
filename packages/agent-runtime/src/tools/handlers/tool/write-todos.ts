import type { CodebuffToolHandlerFunction } from '../handler-function-type'

type ToolName = 'write_todos'
export const handleWriteTodos: CodebuffToolHandlerFunction<ToolName> = (
  params,
) => {
  const { previousToolCallFinished, toolCall } = params
  const { todos } = toolCall.input

  return {
    result: (async () => {
      await previousToolCallFinished
      return [
        {
          type: 'json',
          value: {
            todos,
          },
        },
      ]
    })(),
    state: {},
  }
}
