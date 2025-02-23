import { Message } from '../types/message'
import { match, P } from 'ts-pattern'
import { TOOL_RESULT_MARKER } from '../constants'

export const didClientUseTool = (message: Message) =>
  match(message)
    .with(
      {
        role: 'user',
        content: P.string.and(
          P.when((content) => (content as string).includes(TOOL_RESULT_MARKER))
        ),
      },
      () => true
    )
    .otherwise(() => false)

export type RawToolCall = {
  name: string
  id: string
  parameters: Record<string, any>
}
