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

  let printedResponse = ''
  let fullResponse = ''
  const continuedMessages: Message[] = []

  while (true) {
    console.log('layer', layer)
    const messagesWithContinuedMessages = [...messages, ...continuedMessages]
    if (layer === 1) {
      const { files } = await layer1(
        ws,
        userId,
        messagesWithContinuedMessages,
        fileContext
      )

      const filesInfoMessage = getRelevantFileInfoMessage(files)
      onResponseChunk(filesInfoMessage)

      fileContext.files = files
      printedResponse += filesInfoMessage
      fullResponse += filesInfoMessage
      layer = 2

      await warmCache(fileContext, messagesWithContinuedMessages, userId)
    } else if (layer === 2) {
      const { files, codeReviewResponse, brainstormResponse, choosePlanInfo } =
        await layer2(
          ws,
          userId,
          messagesWithContinuedMessages,
          fileContext,
          onResponseChunk
        )

      const filesInfoMessage = getRelevantFileInfoMessage(files)

      fileContext.files = files

      const assistantResponse = `
${filesInfoMessage}
<code_review>
${codeReviewResponse}
</code_review>
<brainstorm>
${brainstormResponse}
</brainstorm>
<choose_plan>
${choosePlanInfo.fullResponse}
</choose_plan>
      `.trim()
      console.log('<layer_2>', assistantResponse, '</layer_2>')
      fullResponse += assistantResponse

      continuedMessages.push(
        {
          role: 'assistant',
          content: assistantResponse,
        },
        {
          role: 'user',
          content: 'Continue',
        }
      )

      const { chosenPlan } = choosePlanInfo
      if (chosenPlan === 'PAUSE') {
        onResponseChunk(choosePlanInfo.fullResponse)
        printedResponse += choosePlanInfo.fullResponse
        return {
          response: fullResponse,
          changes: [],
        }
      } else if (chosenPlan === 'GATHER_MORE_INFO') {
        layer = 2
        await warmCache(fileContext, messagesWithContinuedMessages, userId)
      } else if (chosenPlan === 'PROCEED') layer = 3
    } else if (layer === 3) {
      const { changes, response } = await layer3(
        ws,
        userId,
        messagesWithContinuedMessages,
        fileContext,
        onResponseChunk
      )

      printedResponse += response
      fullResponse += response

      return {
        response: fullResponse,
        changes,
      }
    }
  }
}

const warmCache = async (
  fileContext: ProjectFileContext,
  messages: Message[],
  userId: string
) => {
  console.log('Starting to warm cache')
  const startTime = Date.now()
  const system = getSystemPrompt(fileContext)
  await promptClaude(messages, {
    model: models.sonnet,
    system,
    userId,
    maxTokens: 1,
  })
  const endTime = Date.now()
  const duration = endTime - startTime
  console.log(`Warmed cache in ${duration}ms`)
}

function getRelevantFileInfoMessage(files: {
  [filePath: string]: string | null
}) {
  const filePaths = Object.keys(files)
  if (filePaths.length === 0) {
    return ''
  }
  return `Reading the following files...<files>${filePaths.join(', ')}</files>\n\n`
}
