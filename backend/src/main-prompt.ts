import { WebSocket } from 'ws'
import fs from 'fs'
import path from 'path'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { match, P } from 'ts-pattern'

import { promptClaudeStream } from './claude'
import { createFileBlock, ProjectFileContext } from 'common/util/file'
import { didClientUseTool, DEFAULT_TOOLS } from 'common/util/tools'
import { getSearchSystemPrompt, getAgentSystemPrompt } from './system-prompt'
import { STOP_MARKER } from 'common/constants'
import { FileChange, Message } from 'common/actions'
import { ToolCall } from 'common/actions'
import { debugLog } from './util/debug'
import { requestFiles, requestFile } from './websockets/websocket-action'
import { generatePatch } from './generate-patch'
import { requestRelevantFiles } from './request-files-prompt'
import { processStreamWithFiles } from './process-stream'
import { countTokens } from './util/token-counter'
import { generateKnowledgeFiles } from './generate-knowledge-files'

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
  let genKnowledgeFilesPromise: Promise<Promise<FileChange>[]> =
    Promise.resolve([])
  const fileProcessingPromises: Promise<FileChange | null>[] = []
  const tools = DEFAULT_TOOLS
  const lastMessage = messages[messages.length - 1]

  let shouldCheckFiles = true
  if (Object.keys(fileContext.files).length === 0) {
    // Getting here typically means it's the first message from the user.
    const system = getSearchSystemPrompt(fileContext)
    // If the fileContext.files is empty, use prompts to select files and add them to context.
    const responseChunk = await updateFileContext(
      ws,
      fileContext,
      { messages, system, tools },
      null,
      onResponseChunk,
      userId
    )
    fullResponse += responseChunk
    shouldCheckFiles = false
  } else {
    // Already have context from existing chat

    // If client used tool, we don't want to generate knowledge files because the user isn't really in control

    if (!didClientUseTool(lastMessage)) {
      genKnowledgeFilesPromise = generateKnowledgeFiles(
        userId,
        ws,
        fullResponse,
        fileContext,
        messages
      )
    }
  }

  const lastUserMessageIndex = messages.findLastIndex(
    (message) => message.role === 'user' && typeof message.content === 'string'
  )
  const numAssistantMessages = messages
    .slice(lastUserMessageIndex)
    .filter((message) => message.role === 'assistant').length
  const shouldPause = numAssistantMessages >= 3
  if (shouldPause) {
    const response = `\nI'll pause to get more instructions from the user.\n`
    onResponseChunk(response)
    return {
      response,
      changes: [],
      toolCall: null,
    }
  }

  let toolCall: ToolCall | null = null
  let continuedMessages: Message[] = []
  let isComplete = false
  let iterationCount = 0
  const MAX_ITERATIONS = 10

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
    const system = getAgentSystemPrompt(fileContext, {
      checkFiles: shouldCheckFiles,
    })
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
            return null
          })
        )
        fullResponse += fileContent
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
          {
            messages,
            system: getSearchSystemPrompt(fileContext),
            tools,
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
  const knowledgeChanges = await genKnowledgeFilesPromise
  fileProcessingPromises.push(...knowledgeChanges)
  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== null
  )
  const changeAppendix =
    changes.length > 0
      ? `\n\n<edits_made_by_assistant>\n${changes
          .map(({ filePath, content }) => createFileBlock(filePath, content))
          .join('\n')}\n</edits_made_by_assistant>`
      : ''

  return {
    response: `${fullResponse}${changeAppendix}`,
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
  {
    messages,
    system,
    tools,
  }: {
    messages: Message[]
    system: string | Array<TextBlockParam>
    tools: Tool[]
  },
  prompt: string | null,
  onResponseChunk: (chunk: string) => void,
  userId: string
) {
  const relevantFiles = await requestRelevantFiles(
    { messages, system, tools },
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
): Promise<FileChange> {
  debugLog('Processing file block', filePath)

  const oldContent = await requestFile(ws, filePath)

  if (oldContent === null) {
    console.log(`Created new file: ${filePath}`)
    debugLog(`Created new file: ${filePath}`)
    return { filePath, content: newContent, type: 'file' }
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
  debugLog('oldContent\n', oldContent, '\npatch\n', patch)
  return { filePath, content: patch, type: 'patch' }
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
