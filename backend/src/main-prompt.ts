import { WebSocket } from 'ws'
import fs from 'fs'
import path from 'path'
import { Tool } from '@anthropic-ai/sdk/resources'
import { createPatch } from 'diff'

import { promptClaudeStream } from './claude'
import {
  ProjectFileContext,
  parseFileBlocks,
  fileRegex,
} from 'common/util/file'
import { getSystemPrompt } from './system-prompt'
import { STOP_MARKER } from 'common/constants'
import { getTools } from './tools'
import { Message } from 'common/actions'
import { ToolCall } from 'common/actions'
import { debugLog } from './debug'
import { requestFiles, requestFile } from './websockets/websocket-action'
import { generatePatch } from './generate-diffs-via-expansion'
import { requestRelevantFiles } from './request-files-prompt'

/**
 * Prompt claude, handle tool calls, and generate file changes.
 */
export async function mainPrompt(
  ws: WebSocket,
  messages: Message[],
  fileContext: ProjectFileContext,
  onResponseChunk: (chunk: string) => void
) {
  debugLog(
    'Starting promptClaudeAndGetFileChanges',
    'messages:',
    messages.length
  )

  let fullResponse = ''

  if (Object.keys(fileContext.files).length === 0) {
    // If the fileContext.files is empty, use prompts to select files and add them to context.
    const responseChunk = await updateFileContext(
      ws,
      fileContext,
      messages,
      null,
      onResponseChunk
    )
    fullResponse += responseChunk
  }

  const tools = getTools()
  const lastMessage = messages[messages.length - 1]
  const fileProcessingPromises: Promise<string>[] = []
  let toolCall: ToolCall | null = null
  let continuedMessages: Message[] = []
  let currentFileBlock = ''
  let isComplete = false

  if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
    lastMessage.content = `${lastMessage.content}

<additional_instruction>
Always end your response with the following marker:
${STOP_MARKER}
</additional_instruction>`
  }

  while (!isComplete) {
    const system = getSystemPrompt(fileContext)
    const messagesWithContinuedMessage = continuedMessages
      ? [...messages, ...continuedMessages]
      : messages

    savePromptLengthInfo(messagesWithContinuedMessage, system, tools)

    const stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      tools,
    })

    for await (const chunk of stream) {
      if (typeof chunk === 'object') {
        toolCall = chunk
        debugLog('Received tool call:', toolCall)
        break
      }

      fullResponse += chunk
      currentFileBlock += chunk
      onResponseChunk(chunk)

      const fileBlocks = parseFileBlocks(currentFileBlock)
      for (const [filePath, newFileContent] of Object.entries(fileBlocks)) {
        fileProcessingPromises.push(
          processFileBlock(ws, messages, filePath, newFileContent)
        )

        currentFileBlock = currentFileBlock.replace(fileRegex, '')
      }
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
          toolCall.input['prompt']
        )
        const responseChunk = getRelevantFileInfoMessage(relevantFiles)
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

  const changes = await Promise.all(fileProcessingPromises)

  return {
    response: fullResponse,
    changes,
    toolCall,
  }
}

function getRelevantFileInfoMessage(filePaths: string[]) {
  return `Reading the following files...<files>${filePaths.join(', ')}</files>\n\n`
}

async function updateFileContext(
  ws: WebSocket,
  fileContext: ProjectFileContext,
  messages: Message[],
  prompt: string | null,
  onResponseChunk: (chunk: string) => void
) {
  const relevantFiles = await requestRelevantFiles(
    messages,
    fileContext,
    prompt
  )

  const responseChunk = getRelevantFileInfoMessage(relevantFiles)
  onResponseChunk(responseChunk)

  // Load relevant files content
  const fileContents = await requestFiles(ws, relevantFiles)
  const files = Object.fromEntries(
    Object.entries(fileContents).filter(([_, content]) => content !== null)
  ) as { [path: string]: string }

  fileContext.files = files

  return responseChunk
}

export async function processFileBlock(
  ws: WebSocket,
  messageHistory: Message[],
  filePath: string,
  newContent: string
) {
  debugLog('Processing file block', filePath)

  const oldContent = await requestFile(ws, filePath)

  if (oldContent === null) {
    debugLog(`Created new file: ${filePath}`)
    return createPatch(filePath, '', newContent)
  }

  const patch = await generatePatch(
    oldContent,
    newContent,
    filePath,
    messageHistory
  )
  debugLog(`Generated patch for file: ${filePath}`)
  return patch
}

const savePromptLengthInfo = (
  messages: Message[],
  system: string,
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
