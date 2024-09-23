import { Message } from 'src/actions'
import { match, P } from 'ts-pattern'
import { Tool } from '@anthropic-ai/sdk/resources'
import { TOOL_RESULT_MARKER } from 'src/constants'

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
