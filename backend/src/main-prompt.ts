import { WebSocket } from 'ws'
import fs from 'fs'
import path from 'path'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { createPatch } from 'diff'

import { promptClaudeStream } from './claude'
import { ProjectFileContext } from 'common/util/file'
import { getSystemPrompt } from './system-prompt'
import { STOP_MARKER } from 'common/constants'
import { getTools } from './tools'
import { Message } from 'common/actions'
import { ToolCall } from 'common/actions'
import { debugLog } from './util/debug'
import { requestFiles, requestFile } from './websockets/websocket-action'
import { generatePatch } from './generate-patch'
import { requestRelevantFiles } from './request-files-prompt'
import { processStreamWithFiles } from './process-stream'
import { editPrompt } from './edit-prompt'

/**
 * Prompt claude, handle tool calls, and generate file changes.
 */
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

  let fullResponse = ''

  let shouldCheckFiles = true
  if (Object.keys(fileContext.files).length === 0) {
    // If the fileContext.files is empty, use prompts to select files and add them to context.
    const responseChunk = await updateFileContext(
      ws,
      fileContext,
      messages,
      null,
      onResponseChunk,
      userId
    )
    fullResponse += responseChunk
    shouldCheckFiles = false
  }

  const tools = getTools()
  const lastMessage = messages[messages.length - 1]
  const fileProcessingPromises: Promise<string>[] = []
  let toolCall: ToolCall | null = null
  let continuedMessages: Message[] = []
  let isComplete = false

  if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
    lastMessage.content = `${lastMessage.content}

<additional_instruction>
Please make as few changes to the code as possible and complete only the core of what is requested. Then pause to get more instructions from the user.
</additional_instruction>
<additional_instruction>
Always end your response with the following marker:
${STOP_MARKER}
</additional_instruction>`
  }

  while (!isComplete) {
    const system = getSystemPrompt(fileContext, shouldCheckFiles)
    const messagesWithContinuedMessage = continuedMessages
      ? [...messages, ...continuedMessages]
      : messages

    savePromptLengthInfo(messagesWithContinuedMessage, system, tools)

    const stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      tools,
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
        const relevantFiles = await requestRelevantFiles(
          messages,
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
  }

  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== ''
  )

  return {
    response: fullResponse,
    changes,
    toolCall,
  }
}

function getRelevantFileInfoMessage(filePaths: string[]) {
  if (filePaths.length === 0) {
    return ''
  }
  return `Reading the following files...<files>${filePaths.join(', ')}</files>\n\n`
}

async function updateFileContext(
  ws: WebSocket,
  fileContext: ProjectFileContext,
  messages: Message[],
  prompt: string | null,
  onResponseChunk: (chunk: string) => void,
  userId: string
) {
  const relevantFiles = await requestRelevantFiles(
    messages,
    fileContext,
    prompt,
    userId
  )

  if (relevantFiles.length === 0) {
    return ''
  }

  const responseChunk = getRelevantFileInfoMessage(relevantFiles)
  onResponseChunk(responseChunk)

  // Load relevant files into fileContext
  fileContext.files = await requestFiles(ws, relevantFiles)

  return responseChunk
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

  const updatedContent = await editPrompt(
    userId,
    filePath,
    newContent,
    oldContent,
    messageHistory
  )

  const patch = await generatePatch(
    userId,
    oldContent,
    updatedContent,
    filePath,
    messageHistory,
    fullResponse
  )
  console.log(`Generated patch for file: ${filePath}`)
  debugLog(`Generated patch for file: ${filePath}`)
  return patch
}

const savePromptLengthInfo = (
  messages: Message[],
  system: string | Array<TextBlockParam>,
  tools: Tool[]
) => {
  console.log('Prompting claude num messages:', messages.length)
  debugLog('Prompting claude num messages:', messages.length)

  const lastMessageContent = messages[messages.length - 1].content

  // Save prompt debug information to a JSON array
  const promptDebugInfo = {
    input:
      typeof lastMessageContent === 'string' ? lastMessageContent : '[object]',
    messages: JSON.stringify(messages).length,
    system: system.length,
    tools: JSON.stringify(tools).length,
    timestamp: new Date().toISOString(), // Add a timestamp for each entry
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
