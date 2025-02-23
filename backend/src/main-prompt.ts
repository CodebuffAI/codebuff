import { WebSocket } from 'ws'
import { TextBlockParam } from '@anthropic-ai/sdk/resources'

import { AnthropicModel } from 'common/constants'
import { promptClaudeStream } from './claude'
import { parseToolCallXml } from './util/parse-tool-call-xml'
import {
  TOOL_RESULT_MARKER,
  STOP_MARKER,
  getModelForMode,
} from 'common/constants'
import { FileVersion, ProjectFileContext } from 'common/util/file'
import { didClientUseTool } from 'common/util/tools'
import { getSearchSystemPrompt, getAgentSystemPrompt } from './system-prompt'
import { Message } from 'common/types/message'
import { ClientAction, FileChange, FileChanges } from 'common/actions'
import { type CostMode } from 'common/constants'
import { ToolCall } from 'common/actions'
import { requestFile, requestFiles } from './websockets/websocket-action'
import { processFileBlock } from './process-file-block'
import { requestRelevantFiles } from './find-files/request-files-prompt'
import { processStreamWithTags } from './process-stream'
import { countTokens, countTokensJson } from './util/token-counter'
import { logger } from './util/logger'
import { difference, uniq, zip } from 'lodash'
import { buildArray } from 'common/util/array'
import {
  checkConversationProgress,
  checkToAllowUnboundedIteration,
} from './conversation-progress'
import {
  getRelevantFilesForPlanning,
  loadFilesForPlanning,
  planComplexChange,
} from './planning'
import { getMessageText } from './util/messages'
import { buildSystemPrompt } from './build-system-prompt'
import { ClientToolCall, parseToolCalls, updateContext } from './tools'
import { AgentState } from 'common/types/agent-state'
import { generateCompactId } from 'common/util/string'

export async function mainPrompt(
  ws: WebSocket,
  messages: Message[],
  fileContext: ProjectFileContext,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  onResponseChunk: (chunk: string) => void,
  userId: string | undefined,
  changesAlreadyApplied: FileChanges,
  costMode: CostMode
) {
  const lastUserMessageIndex = messages.findLastIndex(
    (message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      !message.content.includes(TOOL_RESULT_MARKER)
  )
  const lastUserMessage = messages[lastUserMessageIndex]
  const lastUserPrompt = getMessageText(lastUserMessage) as string
  const allowUnboundedIterationPromise = checkToAllowUnboundedIteration(
    messages[lastUserMessageIndex],
    {
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  ).catch((error) => {
    logger.error(error, 'Error checking to allow unbounded iteration')
    return false
  })

  let fullResponse = ''
  const fileProcessingPromises: Promise<FileChange | null>[] = []
  const lastMessage = messages[messages.length - 1]
  const messagesWithoutLastMessage = messages.slice(0, -1)

  let addedFileVersions: FileVersion[] = []
  let resetFileVersions = false
  const justUsedATool = didClientUseTool(lastMessage)
  const userMessages = messages.filter((m) => m.role === 'user')
  const recentlyDidThinking = userMessages
    .slice(-3)
    .some((m) => JSON.stringify(m.content).includes('think_deeply'))

  const messagesTokens = countTokensJson(messages)
  // Step 1: Read more files.
  const system = getSearchSystemPrompt(fileContext, costMode, messagesTokens)
  const {
    newFileVersions,
    toolCallMessage,
    addedFiles,
    clearFileVersions,
    readFilesMessage,
  } = await getFileVersionUpdates(ws, messages, system, fileContext, null, {
    skipRequestingFiles: justUsedATool,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
  })
  fileContext.fileVersions = newFileVersions
  if (clearFileVersions) {
    resetFileVersions = true
  } else {
    addedFileVersions.push(...addedFiles)
  }
  if (readFilesMessage !== undefined) {
    onResponseChunk(readFilesMessage)
    fullResponse += `\n\n${toolCallMessage}\n\n${readFilesMessage}`
  }

  let allowUnboundedIteration = await allowUnboundedIterationPromise

  const numAssistantMessages = messages
    .slice(lastUserMessageIndex)
    .filter((message) => message.role === 'assistant').length
  const shouldPause = !allowUnboundedIteration && numAssistantMessages >= 6
  if (shouldPause) {
    const response = `\nI'll pause to get more instructions from the user.\n`
    onResponseChunk(response)
    return {
      response,
      changes: [],
      toolCall: null,
      addedFileVersions,
      resetFileVersions,
    }
  }

  let toolCall: ToolCall | null = null
  let continuedMessages: Message[] = fullResponse
    ? [{ role: 'assistant', content: fullResponse.trim() }]
    : []
  let isComplete = false
  let iterationCount = 0
  const MAX_ITERATIONS = 5

  let newLastMessage: Message = lastMessage
  if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
    newLastMessage = {
      ...lastMessage,
      content:
        getExtraInstructionForUserPrompt(
          fileContext,
          messages,
          costMode,
          allowUnboundedIteration,
          justUsedATool,
          recentlyDidThinking,
          numAssistantMessages
        ) +
        '\n\n' +
        lastMessage.content,
    }
  }

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessages
      ? [...messagesWithoutLastMessage, newLastMessage, ...continuedMessages]
      : messages

    const messagesTokens = countTokensJson(messagesWithContinuedMessage)
    const system = getAgentSystemPrompt(fileContext, costMode, messagesTokens)

    logger.debug(
      {
        lastMessage: messages[messages.length - 1].content,
        messageCount: messages.length,
      },
      'Prompting Main'
    )

    const stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      model: getModelForMode(costMode, 'agent') as AnthropicModel,
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
          const fileContentWithoutStartNewline = fileContent.startsWith('\n')
            ? fileContent.slice(1)
            : fileContent
          fileProcessingPromises.push(
            processFileBlock(
              path,
              fileContentWithoutStartNewline,
              messages,
              fullResponse,
              lastUserPrompt,
              clientSessionId,
              fingerprintId,
              userInputId,
              userId,
              ws,
              costMode
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
          let contentAttributes: Record<string, string> = {}
          if (name === 'run_terminal_command') {
            contentAttributes.command = content
          } else if (name === 'scrape_web_page') {
            contentAttributes.url = content
          } else if (name === 'find_files') {
            contentAttributes.description = content
          } else if (name === 'read_files') {
            contentAttributes.file_paths = content
          } else if (name === 'code_search') {
            contentAttributes.pattern = content
          } else if (name === 'think_deeply') {
          } else if (name === 'browser_action') {
            contentAttributes = parseToolCallXml(content)
          }
          fullResponse += `<tool_call name="${attributes.name}">${content}</tool_call${'>'}`
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
    for await (const chunk of streamWithTags) {
      fullResponse += chunk
      // Don't print [END] to user.
      let printedChunk = savedForNextChunk + chunk
      savedForNextChunk = ''

      if (printedChunk.includes('\n[END]')) {
        printedChunk = printedChunk.replace('\n[END]', '')
      } else if (printedChunk.includes(STOP_MARKER)) {
        printedChunk = printedChunk.replace(STOP_MARKER, '')
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

    const toolCallResult = toolCall as ToolCall | null

    if (toolCallResult?.name === 'think_deeply') {
      const fetchFilesStart = Date.now()
      const filePaths = await getRelevantFilesForPlanning(
        messagesWithoutLastMessage,
        lastUserPrompt,
        fileContext,
        costMode,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId
      )
      const fetchFilesDuration = Date.now() - fetchFilesStart
      logger.debug(
        { lastUserPrompt, filePaths, fetchFilesDuration },
        'Got file paths for thinking deeply'
      )
      const fileContents = await loadFilesForPlanning(ws, filePaths)
      const existingFilePaths = Object.keys(fileContents)

      onResponseChunk(
        `\nConsidering the following relevant files:\n${existingFilePaths.join('\n')}\n`
      )
      fullResponse += `\nConsidering the following relevant files:\n${existingFilePaths.join('\n')}\n`
      onResponseChunk(`\nThinking deeply (can take a minute!)`)

      logger.debug(
        { lastUserPrompt, filePaths, existingFilePaths },
        'Thinking deeply'
      )
      const planningStart = Date.now()

      const { response, fileProcessingPromises: promises } =
        await planComplexChange(
          fileContents,
          messagesWithoutLastMessage,
          lastUserPrompt,
          ws,
          {
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
            costMode,
          }
        )
      fileProcessingPromises.push(...promises)
      // For now, don't print the plan to the user.
      // onResponseChunk(`${response}\n\n`)
      fullResponse += response + '\n\n'
      logger.debug(
        {
          lastUserPrompt,
          file_paths: filePaths,
          response,
          fetchFilesDuration,
          planDuration: Date.now() - planningStart,
        },
        'Generated plan'
      )

      toolCall = {
        id: Math.random().toString(36).slice(2),
        name: 'continue',
        input: {
          response: `Please summarize briefly the action taken, but do not call the think_deeply tool again for now.`,
        },
      }
      isComplete = true
    } else if (toolCallResult?.name === 'find_files') {
      logger.debug(toolCallResult, 'tool call')
      const description = toolCallResult.input.description
      const {
        newFileVersions,
        addedFiles,
        clearFileVersions,
        readFilesMessage,
      } = await getFileVersionUpdates(
        ws,
        [...messages, { role: 'assistant', content: fullResponse }],
        getSearchSystemPrompt(fileContext, costMode, messagesTokens),
        fileContext,
        description,
        {
          skipRequestingFiles: false,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          costMode,
        }
      )
      fileContext.fileVersions = newFileVersions
      if (clearFileVersions) {
        resetFileVersions = true
      } else {
        addedFileVersions.push(...addedFiles)
      }
      if (readFilesMessage !== undefined) {
        onResponseChunk(`\n${readFilesMessage}`)
        fullResponse += `\n${readFilesMessage}`
      }
      toolCall = null
      isComplete = false
      continuedMessages = [
        {
          role: 'assistant',
          content: fullResponse.trim(),
        },
      ]
    } else if (toolCallResult?.name === 'read_files') {
      logger.debug(toolCallResult, 'tool call')
      const existingFilePaths = fileContext.fileVersions.flatMap((files) =>
        files.map((file) => file.path)
      )
      const filePaths = ((toolCallResult.input.file_paths as string) ?? '')
        .trim()
        .split('\n')
        .filter((path) => path)
      const newFilePaths = difference(filePaths, existingFilePaths)
      logger.debug(
        {
          content: toolCallResult.input.file_paths,
          existingFilePaths,
          filePaths,
          newFilePaths,
        },
        'read_files tool call'
      )

      const {
        newFileVersions,
        addedFiles,
        clearFileVersions,
        readFilesMessage,
      } = await getFileVersionUpdates(
        ws,
        [...messages, { role: 'assistant', content: fullResponse }],
        getSearchSystemPrompt(fileContext, costMode, messagesTokens),
        fileContext,
        null,
        {
          skipRequestingFiles: false,
          requestedFiles: newFilePaths,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          costMode,
        }
      )
      fileContext.fileVersions = newFileVersions
      if (clearFileVersions) {
        resetFileVersions = true
      } else {
        addedFileVersions.push(...addedFiles)
      }
      if (readFilesMessage !== undefined) {
        onResponseChunk(`\n${readFilesMessage}`)
        fullResponse += `\n${readFilesMessage}`
      }
      toolCall = null
      isComplete = false
      continuedMessages = [
        {
          role: 'assistant',
          content: fullResponse.trim(),
        },
      ]
    } else if (toolCallResult !== null) {
      isComplete = true
      logger.debug(toolCallResult, 'tool call')
    } else if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      if (!allowUnboundedIteration) {
        logger.debug('Reached STOP_MARKER')
      } else {
        // Check if we should actually stop or continue via tool call
        const { shouldStop, response } = await checkConversationProgress(
          [
            ...messages.slice(lastUserMessageIndex),
            {
              role: 'assistant' as const,
              content: fullResponse.trim(),
            },
          ],
          fileContext,
          {
            costMode,
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
          }
        )

        onResponseChunk(`\n${response}\n`)

        if (shouldStop) {
          logger.debug('Reached STOP_MARKER and confirmed should stop')
        } else {
          // Signal to client to continue the conversation
          logger.debug('Reached STOP_MARKER but should continue')
          toolCall = {
            id: Math.random().toString(36).slice(2),
            name: 'continue',
            input: {
              response: `Determination on proceeding to complete user request: ${response}`,
            },
          }
        }
      }
    } else {
      const lines = fullResponse.split('\n')
      logger.debug({ lastLine: lines.at(-1) }, 'Continuing to generate')
      const fullResponseMinusLastLine = lines.slice(0, -1).join('\n') + '\n'
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
    if (iterationCount >= MAX_ITERATIONS) {
      logger.warn('Reached maximum number of iterations in mainPrompt')
      isComplete = true
      if (allowUnboundedIteration && toolCall === null) {
        toolCall = {
          id: Math.random().toString(36).slice(2),
          name: 'continue',
          input: {
            response: `Continue`,
          },
        }
      }
    }
  }

  if (fileProcessingPromises.length > 0) {
    onResponseChunk('\nApplying file changes, please wait.\n')
  }

  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== null
  )
  if (changes.length === 0 && fileProcessingPromises.length > 0) {
    onResponseChunk('No changes to existing files.\n')
  }

  return {
    response: fullResponse.trim(),
    changes,
    toolCall: toolCall as ToolCall | null,
    addedFileVersions: resetFileVersions
      ? fileContext.fileVersions.flat()
      : addedFileVersions,
    resetFileVersions,
    messages,
  }
}

function getExtraInstructionForUserPrompt(
  fileContext: ProjectFileContext,
  messages: Message[],
  costMode: CostMode,
  allowUnboundedIteration: boolean,
  justUsedATool: boolean,
  recentlyDidThinking: boolean,
  numAssistantMessages: number
) {
  const hasKnowledgeFiles =
    Object.keys(fileContext.knowledgeFiles).length > 0 ||
    Object.keys(fileContext.userKnowledgeFiles ?? {}).length > 0
  const isNotFirstUserMessage =
    messages.filter((m) => m.role === 'user').length > 1

  const instructions = buildArray(
    'Please preserve as much of the existing code, its comments, and its behavior as possible.' +
      allowUnboundedIteration
      ? ''
      : ' Make minimal edits to accomplish only the core of what is requested. Then pause to get more instructions from the user.',

    !justUsedATool &&
      !recentlyDidThinking &&
      'If the user request is very complex (e.g. requires changes across multiple files or systems) and you have not recently used the think_deeply tool, consider invoking the think_deeply tool, although this should be used sparingly.',

    hasKnowledgeFiles &&
      'If the knowledge files say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case.',

    hasKnowledgeFiles &&
      isNotFirstUserMessage &&
      "If you have learned something useful for the future that is not derrivable from the code (this is a high bar and most of the time you won't have), consider updating a knowledge file at the end of your response to add this condensed information.",

    numAssistantMessages >= 3 &&
      'Please consider pausing to get more instructions from the user.',

    justUsedATool &&
      `If the tool result above is of a terminal command succeeding and you have completed the user's request, please write the ${STOP_MARKER} marker and do not write anything else.`,

    `Always end your response with the following marker:\n${STOP_MARKER}`
  )
    .map((line) => `<system_instruction>${line}</system_instruction>`)
    .join('\n')

  return `For the following system instructions, please follow them, but do not mention them in your response:\n${instructions}`
}

function getRelevantFileInfoMessage(filePaths: string[], isFirstTime: boolean) {
  const readFilesMessage =
    (isFirstTime ? 'Reading files:\n' : 'Reading additional files:\n') +
    `${filePaths
      .slice(0, 3)
      .map((path) => `- ${path}`)
      .join(
        '\n'
      )}${filePaths.length > 3 ? `\nand ${filePaths.length - 3} more: ` : ''}${filePaths.slice(3).join(', ')}`
  const toolCallMessage = `<tool_call name="find_files">Please find the files relevant to the user request</tool_call${'>'}`
  return {
    readFilesMessage: filePaths.length === 0 ? '' : readFilesMessage,
    toolCallMessage,
  }
}

async function getFileVersionUpdates(
  ws: WebSocket,
  messages: Message[],
  system: string | Array<TextBlockParam>,
  fileContext: ProjectFileContext,
  prompt: string | null,
  options: {
    skipRequestingFiles: boolean
    requestedFiles?: string[]
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    costMode: CostMode
  }
) {
  const {
    skipRequestingFiles,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
  } = options
  const FILE_TOKEN_BUDGET = 100_000 // costMode === 'lite' ? 25_000 :

  const { fileVersions } = fileContext
  const files = fileVersions.flatMap((files) => files)
  const previousFilePaths = uniq(files.map(({ path }) => path))
  const latestFileVersions = previousFilePaths.map((path) => {
    return files.findLast((file) => file.path === path)!
  })
  const previousFiles: Record<string, string> = Object.fromEntries(
    zip(
      previousFilePaths,
      latestFileVersions.map((file) => file.content)
    )
  )
  const editedFilePaths = messages
    .map((m) => m.content)
    .filter(
      (content) => typeof content === 'string' && content.includes('<edit_file')
    )
    .map(
      (content) =>
        (content as string).match(/<edit_file\s+path="([^"]+)">/)?.[1]
    )
    .filter((path): path is string => path !== undefined)

  const requestedFiles = skipRequestingFiles
    ? []
    : options.requestedFiles ??
      (await requestRelevantFiles(
        { messages, system },
        fileContext,
        prompt,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        costMode
      )) ??
      []

  const allFilePaths = uniq([
    ...requestedFiles,
    ...editedFilePaths,
    ...previousFilePaths,
  ])
  const loadedFiles = await requestFiles(ws, allFilePaths)

  const filteredRequestedFiles = requestedFiles.filter((filePath, i) => {
    const content = loadedFiles[filePath]
    if (content === undefined) return false
    if (content === null) return true
    const tokenCount = countTokens(content)
    if (i < 5) {
      return tokenCount < 50_000 - i * 10_000
    }
    return tokenCount < 10_000
  })
  const newFiles = difference(filteredRequestedFiles, previousFilePaths)

  const updatedFiles = [...previousFilePaths, ...editedFilePaths].filter(
    (path) => {
      return loadedFiles[path] !== previousFiles[path]
    }
  )

  const addedFiles = uniq([...updatedFiles, ...newFiles])
    .map((path) => {
      return {
        path,
        content: loadedFiles[path]!,
      }
    })
    .filter((file) => file.content !== null)

  const fileVersionTokens = countTokensJson(files)
  const addedFileTokens = countTokensJson(addedFiles)

  if (fileVersionTokens + addedFileTokens > FILE_TOKEN_BUDGET) {
    const knowledgeFiles = Object.entries(fileContext.knowledgeFiles).map(
      ([path, content]) => ({
        path,
        content,
      })
    )
    const requestedLoadedFiles = filteredRequestedFiles
      .map((path) => ({
        path,
        content: loadedFiles[path]!,
      }))
      .filter((file) => file.content !== null)

    const files = [...knowledgeFiles, ...requestedLoadedFiles]
    while (countTokensJson(files) > FILE_TOKEN_BUDGET) {
      files.pop()
    }
    const newFileVersions = [
      files.filter((f) => knowledgeFiles.some((kf) => kf.path === f.path)),
      files.filter((f) => !knowledgeFiles.some((kf) => kf.path === f.path)),
    ]
    const readFilesPaths = newFileVersions[1]
      .filter((f) => f.content !== null)
      .map((f) => f.path)

    const { readFilesMessage, toolCallMessage } = getRelevantFileInfoMessage(
      readFilesPaths,
      true
    )

    logger.debug(
      {
        newFileVersions: newFileVersions.map((files) =>
          files.map((f) => f.path)
        ),
        prevFileVersionTokens: fileVersionTokens,
        addedFileTokens,
        beforeTotalTokens: fileVersionTokens + addedFileTokens,
        newFileVersionTokens: countTokensJson(newFileVersions),
        FILE_TOKEN_BUDGET,
      },
      'resetting file versions b/c of token budget'
    )

    return {
      newFileVersions,
      addedFiles,
      clearFileVersions: true,
      readFilesMessage,
      toolCallMessage,
    }
  }

  const newFileVersions = [...fileVersions, addedFiles].filter(
    (files) => files.length > 0
  )
  if (newFiles.length === 0) {
    return {
      newFileVersions,
      addedFiles,
      readFilesMessage: undefined,
      toolCallMessage: undefined,
    }
  }

  const existingNewFilePaths = newFiles.filter(
    (path) => loadedFiles[path] && loadedFiles.content !== null
  )
  const { readFilesMessage, toolCallMessage } = getRelevantFileInfoMessage(
    existingNewFilePaths,
    fileVersions.length <= 1
  )

  return {
    newFileVersions,
    addedFiles,
    readFilesMessage,
    toolCallMessage,
    existingNewFilePaths,
  }
}

export const agentPrompt = async (
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void
) => {
  const { prompt, agentState, fingerprintId, costMode, promptId, toolResults } =
    action
  const { messageHistory, fileContext } = agentState

  const messagesWithUserMessage = prompt
    ? [
        ...messageHistory,
        {
          role: 'user' as const,
          content: prompt,
        },
      ]
    : messageHistory

  let fullResponse = ''
  const fileProcessingPromises: Promise<FileChange | null>[] = []

  const justUsedATool = toolResults.length > 0
  const allMessagesTokens = countTokensJson(messagesWithUserMessage)

  // Step 1: Read more files.
  const searchSystem = getSearchSystemPrompt(
    fileContext,
    costMode,
    allMessagesTokens
  )
  const { newFileVersions, toolCallMessage, readFilesMessage } =
    await getFileVersionUpdates(
      ws,
      messagesWithUserMessage,
      searchSystem,
      fileContext,
      null,
      {
        skipRequestingFiles: justUsedATool,
        clientSessionId,
        fingerprintId,
        userInputId: promptId,
        userId,
        costMode,
      }
    )
  fileContext.fileVersions = newFileVersions
  if (readFilesMessage !== undefined) {
    onResponseChunk(readFilesMessage)
    fullResponse += `\n\n${toolCallMessage}\n\n${readFilesMessage}`
  }

  const { agentContext } = agentState
  const userInstructions = `
${toolResults.length > 0 ? `I just ran some tools. Review the results in the <tool_results> section and update your context with any relevant information.` : ''}
Proceed toward the goal and subgoals.
You must use the updateContext tool call to record your progress and any new information you learned at the end of your response.
Optionally use other tools to make progress towards the goal. Try to use multiple tools in one response to make quick progress.
Use the "complete" tool only when you are confident the goal has been achieved. It can only be used after you've called the "review" tool at least once.
    `.trim()
  const agentMessages = [
    { role: 'assistant' as const, content: agentContext },
    {
      role: 'user' as const,
      content: `${userInstructions}\n\nUser request: ${prompt}`,
    },
  ]
  const agentMessagesTokens = countTokensJson(agentMessages)
  const system = buildSystemPrompt(
    fileContext,
    toolResults,
    agentMessagesTokens
  )

  logger.debug(
    {
      lastMessage:
        messagesWithUserMessage[messagesWithUserMessage.length - 1].content,
      messageCount: messagesWithUserMessage.length,
    },
    'Prompting Main'
  )

  const stream = promptClaudeStream(agentMessages, {
    system,
    model: getModelForMode(costMode, 'agent') as AnthropicModel,
    clientSessionId,
    fingerprintId,
    userInputId: promptId,
    userId,
  })
  const streamWithTags = processStreamWithTags(stream, {
    edit_file: {
      attributeNames: [],
      onTagStart: () => {
        return `<edit_file>`
      },
      onTagEnd: (body) => {
        const { path, content } = parseToolCallXml(body)
        const fileContentWithoutStartNewline = content.startsWith('\n')
          ? content.slice(1)
          : content

        fileProcessingPromises.push(
          processFileBlock(
            path,
            fileContentWithoutStartNewline,
            messagesWithUserMessage,
            fullResponse,
            prompt,
            clientSessionId,
            fingerprintId,
            promptId,
            userId,
            ws,
            costMode
          ).catch((error) => {
            logger.error(error, 'Error processing file block')
            return null
          })
        )
        fullResponse += body + '<' + '/edit_file>'
        return false
      },
    },
  })

  for await (const chunk of streamWithTags) {
    fullResponse += chunk
    onResponseChunk(chunk)
  }

  const messagesWithResponse = [
    ...messagesWithUserMessage,
    { role: 'assistant' as const, content: fullResponse },
  ]
  const toolCalls = parseToolCalls(fullResponse)
  const clientToolCalls: ClientToolCall[] = []

  let newAgentContext = agentContext

  for (const toolCall of toolCalls) {
    const { name, parameters } = toolCall
    if (name === 'edit_file') {
      // edit_file tool calls are handled as they are streamed in.
    } else if (name === 'update_context') {
      newAgentContext = await updateContext(newAgentContext, parameters.prompt)
    } else if (name === 'read_files') {
      const paths = parameters.paths
        .split('\n')
        .map((path) => path.trim())
        .filter(Boolean)
      console.log(`Reading files: ${parameters.paths}`)

      logger.debug(toolCall, 'tool call')
      const existingPaths = fileContext.fileVersions.flatMap((files) =>
        files.map((file) => file.path)
      )
      const newPaths = difference(paths, existingPaths)
      logger.debug(
        {
          content: parameters.paths,
          existingPaths,
          paths,
          newPaths,
        },
        'read_files tool call'
      )

      const { newFileVersions } = await getFileVersionUpdates(
        ws,
        messagesWithResponse,
        getSearchSystemPrompt(fileContext, costMode, allMessagesTokens),
        fileContext,
        null,
        {
          skipRequestingFiles: false,
          requestedFiles: newPaths,
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          userId,
          costMode,
        }
      )
      fileContext.fileVersions = newFileVersions
    } else if (name === 'find_files') {
      const { description } = parameters
      const { newFileVersions, readFilesMessage } = await getFileVersionUpdates(
        ws,
        messagesWithResponse,
        getSearchSystemPrompt(fileContext, costMode, allMessagesTokens),
        fileContext,
        description,
        {
          skipRequestingFiles: false,
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          userId,
          costMode,
        }
      )
      fileContext.fileVersions = newFileVersions
      if (readFilesMessage !== undefined) {
        onResponseChunk(`\n${readFilesMessage}`)
      }
    } else if (name === 'think_deeply') {
      const fetchFilesStart = Date.now()
      // assistant sets the prompt, get from parameters
      const filePaths = await getRelevantFilesForPlanning(
        messagesWithResponse,
        // TODO: Ask assistant to come up with a prompt.
        prompt ?? '',
        fileContext,
        costMode,
        clientSessionId,
        fingerprintId,
        promptId,
        userId
      )
      const fetchFilesDuration = Date.now() - fetchFilesStart
      logger.debug(
        { prompt, filePaths, fetchFilesDuration },
        'Got file paths for thinking deeply'
      )
      const fileContents = await loadFilesForPlanning(ws, filePaths)
      const existingFilePaths = Object.keys(fileContents)

      onResponseChunk(
        `\nConsidering the following relevant files:\n${existingFilePaths.join('\n')}\n`
      )
      fullResponse += `\nConsidering the following relevant files:\n${existingFilePaths.join('\n')}\n`
      onResponseChunk(`\nThinking deeply (can take a minute!)`)

      logger.debug({ prompt, filePaths, existingFilePaths }, 'Thinking deeply')
      const planningStart = Date.now()

      const { response, fileProcessingPromises: promises } =
        await planComplexChange(
          fileContents,
          messagesWithResponse,
          prompt ?? '',
          ws,
          {
            clientSessionId,
            fingerprintId,
            userInputId: promptId,
            userId,
            costMode,
          }
        )
      fileProcessingPromises.push(...promises)
      // For now, don't print the plan to the user.
      // onResponseChunk(`${response}\n\n`)
      fullResponse += response + '\n\n'
      logger.debug(
        {
          prompt,
          file_paths: filePaths,
          response,
          fetchFilesDuration,
          planDuration: Date.now() - planningStart,
        },
        'Generated plan'
      )
    } else if (name === 'execute_command') {
      clientToolCalls.push({
        ...toolCall,
        id: generateCompactId(),
      })
    } else if (name === 'complete') {
      clientToolCalls.push({
        ...toolCall,
        id: generateCompactId(),
      })
    } else {
      throw new Error(`Unknown tool: ${name}`)
    }
  }

  if (fileProcessingPromises.length > 0) {
    onResponseChunk('\nApplying file changes, please wait.\n')
  }

  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== null
  )
  if (changes.length === 0 && fileProcessingPromises.length > 0) {
    onResponseChunk('No changes to existing files.\n')
  }

  for (const change of changes) {
    clientToolCalls.push({
      name: 'edit_file',
      parameters: change,
      id: generateCompactId(),
    })
  }
  const newAgentState: AgentState = {
    ...agentState,
    messageHistory: [
      ...messagesWithUserMessage,
      { role: 'assistant' as const, content: fullResponse },
    ],
    agentContext: newAgentContext,
  }
  return {
    agentState: newAgentState,
    toolCalls: clientToolCalls,
    messageHistory: messagesWithResponse,
  }
}
