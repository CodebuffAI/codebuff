import fs from 'fs'
import path from 'path'
import { WebSocket } from 'ws'
import { createPatch } from 'diff'

import { Message, ToolCall } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { ProjectFileContext } from 'common/util/file'
import { promptClaudeStream, System } from './claude'
import { processStreamWithFiles } from './process-stream'
import { requestRelevantFilesPrompt } from './request-files-prompt'
import { getSystemPrompt } from './system-prompt'
import { debugLog } from './util/debug'
import { generatePatch } from './generate-patch'
import { requestFile } from './websockets/websocket-action'

export const layer3 = async (
  ws: WebSocket,
  userId: string,
  messages: Message[],
  fileContext: ProjectFileContext,
  onResponseChunk: (chunk: string) => void
) => {
  // Prefill the response so that we talk directly to the user.
  let fullResponse = `Based on the above discussion, I'll proceed to answer the user's request:`
  const fileProcessingPromises: Promise<string>[] = []
  let toolCall: ToolCall | null = null
  let continuedMessages: Message[] = [
    { role: 'assistant', content: fullResponse },
  ]
  let isComplete = false
  let iterationCount = 0
  const MAX_ITERATIONS = 10

  const lastMessage = messages[messages.length - 1]
  if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
    lastMessage.content = `${lastMessage.content}

<additional_instruction>
Please preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Then pause to get more instructions from the user.
</additional_instruction>
<additional_instruction>
Always end your response with the following marker:
${STOP_MARKER}
</additional_instruction>`
  }

  while (!isComplete && iterationCount < MAX_ITERATIONS) {
    const system = getSystemPrompt(fileContext, {
      checkFiles: false,
    })
    const messagesWithContinuedMessage = continuedMessages
      ? [...messages, ...continuedMessages]
      : messages

    savePromptLengthInfo(messagesWithContinuedMessage, system)

    const stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      userId,
    })
    const fileStream = processStreamWithFiles(
      stream,
      (_filePath) => {
        onResponseChunk('Modifying...')
      },
      (filePath, fileContent) => {
        console.log('on file!', filePath)
        fileProcessingPromises.push(
          processFileBlock(
            userId,
            ws,
            messages,
            fullResponse,
            filePath,
            fileContent
          ).catch((error) => {
            console.error('Error processing file block', error)
            return ''
          })
        )
      }
    )

    for await (const chunk of fileStream) {
      if (typeof chunk === 'object') {
        toolCall = chunk
        debugLog('Received tool call:', toolCall)
        continue
      }

      fullResponse += chunk
      onResponseChunk(chunk)
    }

    if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      fullResponse = fullResponse.replace(STOP_MARKER, '')
      debugLog('Reached STOP_MARKER')
    } else if (toolCall) {
      if (toolCall.name === 'update_file_context') {
        const relevantFiles = await requestRelevantFilesPrompt(
          {
            messages,
            system,
          },
          fileContext,
          toolCall.input['prompt'],
          userId
        )
        const responseChunk = '\n' + getRelevantFileInfoMessage(relevantFiles)
        onResponseChunk(responseChunk)
        fullResponse += responseChunk
      }
      isComplete = true
    } else {
      console.log('continuing to generate')
      debugLog('continuing to generate')
      const fullResponseMinusLastLine =
        fullResponse.split('\n').slice(0, -1).join('\n') + '\n'
      continuedMessages = [
        {
          role: 'assistant',
          content: fullResponseMinusLastLine,
        },
        {
          role: 'user',
          content: `You got cut off, but please continue from the very next line of your response. Do not repeat anything you have just said. Just continue as if there were no interruption from the very last character of your last response. (Alternatively, just end your response with the following marker if you were done generating and want to allow the user to give further guidance: ${STOP_MARKER})`,
        },
      ]
    }

    iterationCount++
  }

  if (iterationCount >= MAX_ITERATIONS) {
    console.log('Reached maximum number of iterations in mainPrompt')
    debugLog('Reached maximum number of iterations in mainPrompt')
  }

  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== ''
  )

  return {
    changes,
    response: fullResponse,
  }
}

export async function processFileBlock(
  userId: string,
  ws: WebSocket,
  messageHistory: Message[],
  fullResponse: string,
  filePath: string,
  newContent: string
) {
  debugLog('Processing file block', filePath)

  const oldContent = await requestFile(ws, filePath)

  if (oldContent === null) {
    console.log(`Created new file: ${filePath}`)
    debugLog(`Created new file: ${filePath}`)
    return createPatch(filePath, '', newContent)
  }

  const patch = await generatePatch(
    userId,
    oldContent,
    newContent,
    filePath,
    messageHistory,
    fullResponse
  )
  console.log(`Generated patch for file: ${filePath}`)
  debugLog(`Generated patch for file: ${filePath}`)
  return patch
}

function getRelevantFileInfoMessage(filePaths: string[]) {
  if (filePaths.length === 0) {
    return ''
  }
  return `Reading the following files...<files>${filePaths.join(', ')}</files>\n\n`
}

const savePromptLengthInfo = (messages: Message[], system: System) => {
  console.log('Prompting claude num messages:', messages.length)
  debugLog('Prompting claude num messages:', messages.length)

  const lastMessageContent = messages[messages.length - 1].content

  // Save prompt debug information to a JSON array
  const promptDebugInfo = {
    input:
      typeof lastMessageContent === 'string' ? lastMessageContent : '[object]',
    messages: JSON.stringify(messages).length,
    system: system.length,
    timestamp: new Date().toISOString(),
  }

  debugLog(JSON.stringify(promptDebugInfo))

  const debugFilePath = path.join(__dirname, 'prompt.debug.json')

  let debugArray = []
  try {
    const existingData = fs.readFileSync(debugFilePath, 'utf8')
    debugArray = JSON.parse(existingData)
  } catch (error) {
    // If file doesn't exist or is empty, start with an empty array
  }

  debugArray.push(promptDebugInfo)

  fs.writeFileSync(debugFilePath, JSON.stringify(debugArray, null, 2))
}
