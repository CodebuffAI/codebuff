import { WebSocket } from 'ws'
import { TextBlockParam } from '@anthropic-ai/sdk/resources'

import { AnthropicModel } from 'common/constants'
import { promptClaudeStream } from './claude'
import { parseToolCallXml } from './util/parse-tool-call-xml'
import {
  TOOL_RESULT_MARKER,
  STOP_MARKER,
  getModelForMode,
  models,
} from 'common/constants'
import { FileVersion, ProjectFileContext } from 'common/util/file'
import { didClientUseTool } from 'common/util/tools'
import { getSearchSystemPrompt, getAgentSystemPrompt } from './system-prompt'
import { FileChange, FileChanges, Message } from 'common/actions'
import { type CostMode } from 'common/constants'
import { ToolCall } from 'common/actions'
import { requestFile, requestFiles } from './websockets/websocket-action'
import { processFileBlock } from './process-file-block'
import {
  requestRelevantFiles,
  warmCacheForRequestRelevantFiles,
} from './request-files-prompt'
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
import { promptDeepseekStream } from './deepseek-api'
import { messagesWithSystem } from '@/util/messages'

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
  const assistantReplyMessageIndex = lastUserMessageIndex + 1
  const assistantReplyMessage = messages[assistantReplyMessageIndex]
  const assistantIsExecutingPlan =
    assistantReplyMessage && typeof assistantReplyMessage.content === 'string'
      ? assistantReplyMessage.content.includes('plan_complex_change')
      : false

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

    // Prompt cache the new files.
    const system = getSearchSystemPrompt(fileContext, costMode, messagesTokens)
    warmCacheForRequestRelevantFiles(
      system,
      costMode,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    )
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

    let stream: ReadableStream<string>
    // if (costMode === 'lite') {
    //   stream = promptDeepseekStream(
    //     messagesWithSystem(messagesWithContinuedMessage, system),
    //     {
    //       model: models.deepseekReasoner,
    //       clientSessionId,
    //       fingerprintId,
    //       userInputId,
    //       userId,
    //     }
    //   )
    // } else {
    stream = promptClaudeStream(messagesWithContinuedMessage, {
      system,
      model: getModelForMode(costMode, 'agent') as AnthropicModel,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    })
    // }
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
              path,
              filePathWithoutStartNewline,
              userId,
              typeof lastUserMessage?.content === 'string'
                ? lastUserMessage.content
                : undefined
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
          } else if (name === 'plan_complex_change') {
            contentAttributes.prompt = content
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

    if (toolCallResult?.name === 'plan_complex_change') {
      const { prompt } = toolCallResult.input

      onResponseChunk(`\nPrompt: ${prompt}\n`)

      const fetchFilesStart = Date.now()
      const filePaths = await getRelevantFilesForPlanning(
        messages,
        prompt,
        fileContext,
        costMode,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId
      )
      const fetchFilesDuration = Date.now() - fetchFilesStart
      const fileContents = await loadFilesForPlanning(ws, filePaths)
      const existingFilePaths = Object.keys(fileContents)

      onResponseChunk(`\nRelevant files:\n${existingFilePaths.join(' ')}\n`)
      fullResponse += `\nRelevant files:\n${existingFilePaths.join('\n')}\n`
      onResponseChunk(`\nThinking deeply (can take a minute)...\n\n`)

      logger.debug({ prompt, filePaths, existingFilePaths }, 'Thinking deeply')
      const planningStart = Date.now()

      const { response, fileProcessingPromises: promises } =
        await planComplexChange(
          prompt,
          fileContents,
          messages,
          onResponseChunk,
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
      // onResponseChunk(`${plan}\n\n`)
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

      toolCall = {
        id: Math.random().toString(36).slice(2),
        name: 'continue',
        input: {
          response: `Please summarize and review the implementation and make improvements if needed, but do not call the plan_complex_change tool again for now.`,
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
    onResponseChunk('\nApplying file changes. Please wait...\n')
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
      'If the user request is very complex (e.g. requires changes across multiple files or systems), please consider invoking the plan_complex_change tool to create a plan, although this should be used sparingly.',

    hasKnowledgeFiles &&
      'If the knowledge files say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case.',

    hasKnowledgeFiles &&
      isNotFirstUserMessage &&
      "If you have learned something useful for the future that is not derrivable from the code (this is a high bar and most of the time you won't have), consider updating a knowledge file at the end of your response to add this condensed information.",

    numAssistantMessages >= 3 &&
      'Please consider pausing to get more instructions from the user.',

    justUsedATool &&
      `If the tool result above is of a terminal command succeeding and you have completed the user's request, please write the ${STOP_MARKER} marker and do not write anything else to wait for further instructions from the user. Otherwise, please continue to fulfill the user's request.`,

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
    if (i === 0) {
      return tokenCount < 40_000
    }
    if (i < 5) {
      return tokenCount < 25_000 - i * 5_000
    }
    return tokenCount < 5_000
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
    const resetFileVersion = [...knowledgeFiles, ...requestedLoadedFiles]
    const readFilesPaths = resetFileVersion
      .filter((f) => f.content !== null)
      .map((f) => f.path)
    let i = 0
    while (countTokensJson(resetFileVersion) > FILE_TOKEN_BUDGET) {
      const file = resetFileVersion[resetFileVersion.length - 1 - i]
      if (file.content !== null) {
        file.content = '[TRUNCATED TO FIT TOKEN BUDGET]'
      }
      i++
    }
    const newFileVersions =
      resetFileVersion.length > 0 ? [resetFileVersion] : []

    const { readFilesMessage, toolCallMessage } = getRelevantFileInfoMessage(
      readFilesPaths,
      true
    )

    logger.debug(
      {
        newFileVersions: resetFileVersion.map((f) => f.path),
        fileVersionTokens,
        addedFileTokens,
        totalTokens: fileVersionTokens + addedFileTokens,
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
  }
}
