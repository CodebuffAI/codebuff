import { WebSocket } from 'ws'
import { TextBlockParam } from '@anthropic-ai/sdk/resources'

import { promptClaudeStream } from './claude'
import { ProjectFileContext } from 'common/util/file'
import { didClientUseTool } from 'common/util/tools'
import { getSearchSystemPrompt, getAgentSystemPrompt } from './system-prompt'
import { STOP_MARKER, TOOL_RESULT_MARKER } from 'common/constants'
import { FileChange, Message } from 'common/actions'
import { ToolCall } from 'common/actions'
import { requestFiles, requestFile } from './websockets/websocket-action'
import { generatePatch } from './generate-patch'
import {
  requestRelevantFiles,
  warmCacheForRequestRelevantFiles,
} from './request-files-prompt'
import { processStreamWithTags } from './process-stream'
import { generateKnowledgeFiles } from './generate-knowledge-files'
import { countTokens } from './util/token-counter'
import { logger } from './util/logger'
import { generatePatchWithSearchReplace } from './generate-patch-search-replace'

/**
 * Prompt claude, handle tool calls, and generate file changes.
 */
export async function mainPrompt(
  ws: WebSocket,
  messages: Message[],
  fileContext: ProjectFileContext,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  onResponseChunk: (chunk: string) => void,
  userId?: string
) {
  let fullResponse = ''
  let genKnowledgeFilesPromise: Promise<Promise<FileChange | null>[]> =
    Promise.resolve([])
  const fileProcessingPromises: Promise<FileChange | null>[] = []
  const lastMessage = messages[messages.length - 1]
  const messagesWithoutLastMessage = messages.slice(0, -1)

  if (!didClientUseTool(lastMessage)) {
    // Step 1: Read more files.
    const system = getSearchSystemPrompt(fileContext)
    // If the fileContext.files is empty, use prompts to select files and add them to context.
    const responseChunk = await updateFileContext(
      ws,
      fileContext,
      { messages, system },
      null,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    )
    if (responseChunk !== null) {
      onResponseChunk(responseChunk.readFilesMessage)
      fullResponse += `\n\n${responseChunk.toolCallMessage}\n\n${responseChunk.readFilesMessage}`

      // Prompt cache the new files.
      const system = getSearchSystemPrompt(fileContext)
      warmCacheForRequestRelevantFiles(
        system,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId
      )
    }
  }

  const hasKnowledgeFiles = Object.keys(fileContext.knowledgeFiles).length > 0
  if (
    hasKnowledgeFiles &&
    messages.length > 1 &&
    !didClientUseTool(lastMessage)
  ) {
    // Already have context from existing chat
    // If client used tool, we don't want to generate knowledge files because the user isn't really in control
    genKnowledgeFilesPromise = generateKnowledgeFiles(
      clientSessionId,
      fingerprintId,
      userInputId,
      ws,
      fullResponse,
      fileContext,
      messages,
      userId
    )
  }

  const lastUserMessageIndex = messages.findLastIndex(
    (message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      !message.content.includes(TOOL_RESULT_MARKER)
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
  let continuedMessages: Message[] = fullResponse
    ? [{ role: 'assistant', content: fullResponse }]
    : []
  let isComplete = false
  let iterationCount = 0
  const MAX_ITERATIONS = 10

  let newLastMessage: Message = lastMessage
  if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
    newLastMessage = {
      ...lastMessage,
      content: `${lastMessage.content}

<additional_instruction>
Please preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Then pause to get more instructions from the user.
</additional_instruction>
<additional_instruction>
Always end your response with the following marker:
${STOP_MARKER}
</additional_instruction>`,
    }
  }

  while (!isComplete && iterationCount < MAX_ITERATIONS) {
    const system = getAgentSystemPrompt(fileContext, {
      checkFiles: false,
    })
    const messagesWithContinuedMessage = continuedMessages
      ? [...messagesWithoutLastMessage, newLastMessage, ...continuedMessages]
      : messages

    logger.debug(
      {
        lastMessage: messages[messages.length - 1].content,
        messageCount: messages.length,
      },
      'Prompting Claude Main'
    )

    const stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    })
    const streamWithTags = processStreamWithTags(stream, {
      edit_file: {
        attributeNames: ['path'],
        onTagStart: ({ path }) => {
          return `<edit_file path="${path}">`
        },
        onTagEnd: (fileContent, { path }) => {
          const filePathWithoutStartNewline = fileContent.startsWith('\n')
            ? fileContent.slice(1)
            : fileContent
          fileProcessingPromises.push(
            processFileBlock(
              clientSessionId,
              fingerprintId,
              userInputId,
              ws,
              messages,
              fullResponse,
              path,
              filePathWithoutStartNewline,
              userId
            ).catch((error) => {
              logger.error(error, 'Error processing file block')
              return null
            })
          )
          fullResponse += fileContent + '<' + '/edit_file>'
          return false
        },
      },
      tool_call: {
        attributeNames: ['name'],
        onTagStart: (attributes) => '',
        onTagEnd: (content, attributes) => {
          const name = attributes.name
          const contentAttributes: Record<string, string> = {}
          if (name === 'run_terminal_command') {
            contentAttributes.command = content
          } else if (name === 'scrape_web_page') {
            contentAttributes.url = content
          }
          fullResponse += `<tool_call name="${attributes.name}">${content}</tool_call>`
          toolCall = {
            id: Math.random().toString(36).slice(2),
            name: attributes.name,
            input: contentAttributes,
          }
          return true
        },
      },
    })

    let savedForNextChunk = ''
    let foundEndOfResponse = false
    for await (const chunk of streamWithTags) {
      fullResponse += chunk
      // Don't print [END] to user.
      let printedChunk = savedForNextChunk + chunk
      savedForNextChunk = ''

      if (printedChunk.includes('\n[END]')) {
        foundEndOfResponse = true
        printedChunk = printedChunk.replace('\n[END]', '')
      } else if (
        chunk.endsWith('\n') ||
        chunk.endsWith('\n[') ||
        chunk.endsWith('\n[E') ||
        chunk.endsWith('\n[EN') ||
        chunk.endsWith('\n[END')
      ) {
        savedForNextChunk = chunk.slice(chunk.lastIndexOf('\n['))
        printedChunk = printedChunk.slice(0, -savedForNextChunk.length)
      }

      const openFileRegex = /<edit_file\s+path="([^"]+)">/
      const fileMatches = printedChunk.match(openFileRegex)
      if (fileMatches) {
        const filePath = fileMatches[1]
        const fileContent = await requestFile(ws, filePath)
        const isNewFile = fileContent === null
        printedChunk = printedChunk.replace(
          openFileRegex,
          `- ${isNewFile ? 'Creating' : 'Editing'} file: ${filePath} ...`
        )
      }

      onResponseChunk(printedChunk)
    }
    if (foundEndOfResponse) {
      fullResponse += '\n[END]'
    }

    const maybeToolCall = toolCall as ToolCall | null

    if (maybeToolCall?.name === 'find_files') {
      logger.debug(maybeToolCall, 'tool call')
      const response = await updateFileContext(
        ws,
        fileContext,
        { messages, system: getSearchSystemPrompt(fileContext) },
        fullResponse,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId
      )
      if (response !== null) {
        const { readFilesMessage } = response
        onResponseChunk(`\n\n${readFilesMessage}`)
        fullResponse += `\n\n${readFilesMessage}`
      }
      toolCall = null
      isComplete = false
      continuedMessages = [
        {
          role: 'assistant',
          content: fullResponse.trim(),
        },
      ]
    } else if (maybeToolCall !== null) {
      isComplete = true
      logger.debug(maybeToolCall, 'tool call')
    } else if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      fullResponse = fullResponse.replace(STOP_MARKER, '')
      logger.debug('Reached STOP_MARKER')
    } else {
      logger.debug('Continuing to generate')
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
    logger.warn('Reached maximum number of iterations in mainPrompt')
  }

  if (fileProcessingPromises.length > 0) {
    onResponseChunk('\nApplying file changes. Please wait...\n')
  }

  const knowledgeChanges = await genKnowledgeFilesPromise
  fileProcessingPromises.push(...knowledgeChanges)
  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== null
  )
  return {
    response: fullResponse.trim(),
    changes,
    toolCall: toolCall as ToolCall | null,
  }
}

function getRelevantFileInfoMessage(filePaths: string[]) {
  const readFilesMessage = `Reading the following files...<files>${filePaths.join(', ')}</files>`
  const toolCallMessage = `<tool_call name="find_files">Please find the files relevant to the user request</tool_call>`
  return { readFilesMessage, toolCallMessage }
}

async function updateFileContext(
  ws: WebSocket,
  fileContext: ProjectFileContext,
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlockParam>
  },
  prompt: string | null,
  clientSessionId: string,
  fingerprntId: string,
  userInputId: string,
  userId?: string
) {
  const relevantFiles = await requestRelevantFiles(
    { messages, system },
    fileContext,
    prompt,
    clientSessionId,
    fingerprntId,
    userInputId,
    userId
  )

  if (relevantFiles === null || relevantFiles.length === 0) {
    return null
  }

  const loadedFiles = await requestFiles(ws, relevantFiles)
  const filePaths = Object.keys(loadedFiles)

  const filteredFilePaths = [
    ...filePaths.slice(0, 5),
    // Filter out lower priority files that are too long.
    ...filePaths.slice(5).filter((filePath) => {
      const content = loadedFiles[filePath]
      if (content === null) return true
      const tokenCount = countTokens(content)
      return tokenCount < 5_000
    }),
  ]

  // Load relevant files into fileContext
  fileContext.files = Object.fromEntries(
    filteredFilePaths.map((filePath) => [filePath, loadedFiles[filePath]])
  )

  const existingFiles = Object.keys(fileContext.files).filter(
    (filePath) => fileContext.files[filePath] !== null
  )

  if (existingFiles.length === 0) {
    return null
  }

  const { readFilesMessage, toolCallMessage } =
    getRelevantFileInfoMessage(existingFiles)

  return { readFilesMessage, toolCallMessage }
}

export async function processFileBlock(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  ws: WebSocket,
  messageHistory: Message[],
  fullResponse: string,
  filePath: string,
  newContent: string,
  userId?: string
): Promise<FileChange | null> {
  const oldContent = await requestFile(ws, filePath)

  if (oldContent === null) {
    logger.debug(
      { filePath, sketch: newContent },
      'processFileBlock: Created new file'
    )
    return { filePath, content: newContent, type: 'file' }
  }

  if (newContent === oldContent) {
    logger.info(
      { sketch: newContent },
      'processFileBlock: Sketch was the same as old content, skipping'
    )
    return null
  }

  logger.info({ filePath }, 'processFileBlock: Generating patch')

  const patch = await generatePatchWithSearchReplace(
    clientSessionId,
    fingerprintId,
    userInputId,
    oldContent,
    newContent,
    filePath,
    messageHistory,
    fullResponse,
    userId
  )
  logger.debug(
    { filePath, oldContent, sketch: newContent, patch },
    'processFileBlock: Generated patch'
  )
  return { filePath, content: patch, type: 'patch' }
}
