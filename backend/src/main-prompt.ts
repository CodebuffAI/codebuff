import { WebSocket } from 'ws'

import { ProjectFileContext } from 'common/util/file'
import { Message } from 'common/actions'
import { debugLog } from './util/debug'
import { layer1 } from './layer-1'
import { layer2 } from './layer-2'
import { layer3 } from './layer-3'
import { getSystemPrompt } from './system-prompt'
import { models, promptClaude } from './claude'

export async function mainPrompt(
  ws: WebSocket,
  messages: Message[],
  fileContext: ProjectFileContext,
  userId: string,
  onResponseChunk: (chunk: string) => void
) {
  debugLog(
    'Starting promptClaudeAndGetFileChanges',
    'messages:',
    messages.length
  )

  let layer = Object.keys(fileContext.files).length === 0 ? 1 : 2

  let fullResponse = ''
  const extraFiles: Record<string, string | null> = {}

  while (true) {
    if (layer === 1) {
      const { files, responseChunk } = await layer1(
        ws,
        userId,
        messages,
        fileContext
      )
      const lastMessage = messages[messages.length - 1]
      const input = lastMessage.content as string
      lastMessage.content = [
        {
          type: 'text',
          text: input,
          cache_control: { type: 'ephemeral' as const },
        },
      ]

      fileContext.files = files
      fullResponse += responseChunk
      layer = 2

      const system = getSystemPrompt(fileContext)
      await promptClaude(messages, {
        model: models.sonnet,
        system,
        userId,
        maxTokens: 0,
      })
    } else if (layer === 2) {
      // TODO: A way to loop back to layer 2.
      const { files, codeReviewResponse, brainstormResponse } = await layer2(
        ws,
        userId,
        messages,
        fileContext,
        onResponseChunk
      )
      Object.assign(extraFiles, files)
      fullResponse += brainstormResponse

      const prefilledResponse = `
<extra_files>
${extraFiles}
</extra_files>
<code_review>
${codeReviewResponse}
</code_review>
</code_review>
<brainstorm>
${brainstormResponse}
</brainstorm>
      `.trim()

      messages.push({
        role: 'assistant',
        content: prefilledResponse,
      })

      layer = 3
    } else if (layer === 3) {
      const { changes, response } = await layer3(
        ws,
        userId,
        messages,
        fileContext,
        extraFiles,
        onResponseChunk
      )
      return {
        response: fullResponse,
        changes,
      }
    }
  }
}
