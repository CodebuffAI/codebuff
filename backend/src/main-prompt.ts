import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import { ClientAction } from 'common/actions'
import {
  getModelForMode,
  AnthropicModel,
  HIDDEN_FILE_READ_STATUS,
  models,
} from 'common/constants'
import { type CostMode } from 'common/constants'
import { ToolResult, AgentState } from 'common/types/agent-state'
import { Message } from 'common/types/message'
import { buildArray } from 'common/util/array'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { withCacheControl, toContentString } from 'common/util/messages'
import { generateCompactId } from 'common/util/string'
import { difference, partition, uniq } from 'lodash'
import { WebSocket } from 'ws'

import { checkTerminalCommand } from './check-terminal-command'
import { requestRelevantFiles } from './find-files/request-files-prompt'
import { promptClaudeStream } from './llm-apis/claude'
import { promptGeminiStream } from './llm-apis/gemini-api'
import { processFileBlock } from './process-file-block'
import { processStreamWithTags } from './process-stream'
import { getAgentSystemPrompt } from './system-prompt/agent-system-prompt'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import {
  TOOL_LIST,
  parseToolCalls,
  ClientToolCall,
  updateContextFromToolCalls,
} from './tools'
import { logger } from './util/logger'
import {
  trimMessagesToFitTokenLimit,
  messagesWithSystem,
} from './util/messages'
import {
  isToolResult,
  parseReadFilesResult,
  parseToolCallXml,
  parseToolResults,
  renderReadFilesResult,
  renderToolResults,
  simplifyReadFileResults,
  simplifyReadFileToolResult,
} from './util/parse-tool-call-xml'
import { countTokens, countTokensJson } from './util/token-counter'
import {
  requestFiles,
  requestOptionalFile,
} from './websockets/websocket-action'

// Maximum number of consecutive assistant messages allowed before forcing end_turn
const MAX_CONSECUTIVE_ASSISTANT_MESSAGES = 20

export const mainPrompt = async (
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void
): Promise<{
  agentState: AgentState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> => {
  const { prompt, agentState, fingerprintId, costMode, promptId, toolResults } =
    action
  const { messageHistory, fileContext, agentContext } = agentState

  const hasKnowledgeFiles =
    Object.keys(fileContext.knowledgeFiles).length > 0 ||
    Object.keys(fileContext.userKnowledgeFiles ?? {}).length > 0
  const isNotFirstUserMessage =
    messageHistory.filter((m) => m.role === 'user').length > 0
  const recentlyDidThinking = toolResults.some((t) => t.name === 'think_deeply')
  const justUsedATool = toolResults.length > 0
  const justRanTerminalCommand = toolResults.some(
    (t) => t.name === 'run_terminal_command'
  )
  const userInstructions = buildArray(
    'Instructions:',
    'Proceed toward the user request and any subgoals.',

    "If there are multiple ways the user's request could be interpreted that would lead to very different outcomes, ask at least one clarifying question that will help you understand what they are really asking for. Then use the end_turn tool. If the user specifies that you don't ask questions, make your best assumption and skip this step.",

    'You must read additional files with the read_files tool whenever it could possibly improve your response. Before you use write_file to edit an existing file, make sure to read it.',

    'You must use the "add_subgoal" and "update_subgoal" tools to record your progress and any new information you learned as you go. If the change is very minimal, you may not need to use these tools.',

    'Please preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Makes sure when using write_file to pay attention to any comments in the file you are editing and keep original user comments exactly as they were, line for line.',

    'When editing a file, just highlight the parts of the file that have changed. Do not start writing the first line of the file. Instead, use comments surrounding your edits like "// ... existing code ..." (or "# ... existing code ..." or "/* ... existing code ... */" or "<!-- ... existing code ... -->", whichever is appropriate for the language) plus a few lines of context from the original file.',

    !justUsedATool &&
      !recentlyDidThinking &&
      'If the user request is very complex, consider invoking "<think_deeply></think_deeply>".',

    'If the user is starting a new feature or refactoring, consider invoking "<create_plan></create_plan>".',

    recentlyDidThinking &&
      "Don't act on the plan created by the create_plan tool. Instead, wait for the user to review it.",

    'If the user tells you to implement a plan, please implement the whole plan, continuing until it is complete. Do not stop after one step.',

    hasKnowledgeFiles &&
      'If the knowledge files say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case. No need to run these checks for simple changes.',

    hasKnowledgeFiles &&
      isNotFirstUserMessage &&
      "If you have learned something useful for the future that is not derrivable from the code (this is a high bar and most of the time you won't have), consider updating a knowledge file at the end of your response to add this condensed information.",

    "Don't run git commands or scripts without being specifically asked to do so. This can prevent costly accidents. Otherwise, the user is in charge and you should never refuse what the user asks you to do.",

    'Write "<end_turn></end_turn>" at the end of your response, but only once you are confident the user request has been accomplished or you need more information from the user.'
  ).join('\n')

  const toolInstructions = buildArray(
    justRanTerminalCommand &&
      `If the tool result above is of a terminal command succeeding and you have completed the user's request, please use the end_turn tool and do not write anything else. If your checks are failing, you should only end turn if you have made multiple attempts and feel stuck.`
  ).join('\n')

  const messagesWithToolResultsAndUser = buildArray(
    ...messageHistory,
    toolResults.length > 0 && {
      role: 'user' as const,
      content: renderToolResults(toolResults),
    },
    prompt && {
      role: 'user' as const,
      content: prompt,
    }
  )

  if (prompt) {
    // Check if this is a direct terminal command
    const startTime = Date.now()
    const terminalCommand = await checkTerminalCommand(prompt, {
      clientSessionId,
      fingerprintId,
      userInputId: promptId,
      userId,
    })
    const duration = Date.now() - startTime

    if (terminalCommand) {
      logger.debug(
        {
          duration,
          prompt,
        },
        `Detected terminal command in ${duration}ms, executing directly: ${prompt}`
      )
      const newAgentState = {
        ...agentState,
        messageHistory: messagesWithToolResultsAndUser,
        lastUserPromptIndex: messagesWithToolResultsAndUser.length - 1,
      }
      return {
        agentState: newAgentState,
        toolCalls: [
          {
            id: generateCompactId(),
            name: 'run_terminal_command',
            parameters: {
              command: terminalCommand,
              mode: 'user',
            },
          },
        ],
        toolResults: [],
      }
    }
  } else {
    // Check number of assistant messages since last user message with prompt
    const lastUserPromptIndex = agentState.lastUserPromptIndex ?? -1
    if (lastUserPromptIndex >= 0) {
      const messagesSincePrompt = messageHistory.slice(lastUserPromptIndex + 1)
      const consecutiveAssistantMessages = messagesSincePrompt.filter(
        (msg) => msg.role === 'assistant'
      ).length

      if (consecutiveAssistantMessages >= MAX_CONSECUTIVE_ASSISTANT_MESSAGES) {
        logger.warn(
          `Detected ${consecutiveAssistantMessages} consecutive assistant messages without user prompt`
        )

        const warningString = [
          "I've made quite a few responses in a row.",
          "Let me pause here to make sure we're still on the right track.",
          "Please let me know if you'd like me to continue or if you'd like to guide me in a different direction.",
        ].join(' ')

        onResponseChunk(`${warningString}\n\n`)

        return {
          agentState: {
            ...agentState,
            messageHistory: [
              ...messageHistory,
              { role: 'assistant', content: warningString },
            ],
          },
          toolCalls: [
            {
              id: generateCompactId(),
              name: 'end_turn',
              parameters: {},
            },
          ],
          toolResults: [],
        }
      }
    }
  }

  const fileRequestMessagesTokens = countTokensJson(
    messagesWithToolResultsAndUser
  )

  // Step 1: Read more files.
  const searchSystem = getSearchSystemPrompt(
    fileContext,
    costMode,
    fileRequestMessagesTokens
  )
  const {
    addedFiles,
    updatedFilePaths,
    readFilesMessage,
    clearReadFileToolResults,
  } = await getFileReadingUpdates(
    ws,
    messagesWithToolResultsAndUser,
    searchSystem,
    fileContext,
    null,
    {
      skipRequestingFiles: !prompt,
      clientSessionId,
      fingerprintId,
      userInputId: promptId,
      userId,
      costMode,
    }
  )
  const [updatedFiles, newFiles] = partition(addedFiles, (f) =>
    updatedFilePaths.includes(f.path)
  )
  if (clearReadFileToolResults) {
    // Update message history.
    for (const message of messageHistory) {
      if (isToolResult(message)) {
        message.content = simplifyReadFileResults(message.content)
      }
    }
    // Update tool results.
    for (let i = 0; i < toolResults.length; i++) {
      const toolResult = toolResults[i]
      if (toolResult.name === 'read_files') {
        toolResults[i] = simplifyReadFileToolResult(toolResult)
      }
    }
  }

  if (readFilesMessage !== undefined) {
    onResponseChunk(`${readFilesMessage}\n\n`)
  }

  if (updatedFiles.length > 0) {
    toolResults.push({
      id: generateCompactId(),
      name: 'file_updates',
      result:
        `The following files had modifications made by you or the user. Try to accommodate these changes going forward:\n` +
        renderReadFilesResult(updatedFiles),
    })
  }

  const readFileMessages: Message[] = []
  if (newFiles.length > 0) {
    const readFilesToolResult = {
      id: generateCompactId(),
      name: 'read_files',
      result: renderReadFilesResult(newFiles),
    }

    readFileMessages.push({
      role: 'assistant' as const,
      content: `<read_files>
<paths>
${newFiles.map((file) => file.path).join('\n')}
</paths>
</read_files>`,
    })
    readFileMessages.push({
      role: 'user' as const,
      content: renderToolResults([readFilesToolResult]),
    })
  }

  const messagesWithUserMessage = buildArray(
    ...messageHistory,

    toolResults.length > 0 && {
      role: 'user' as const,
      content: renderToolResults(toolResults),
    },

    // Add in new copy of agent context.
    prompt &&
      agentContext && {
        role: 'user' as const,
        content: agentContext.trim(),
      },

    prompt
      ? // Add in new copy of user instructions.
        {
          role: 'user' as const,
          content: userInstructions,
        }
      : // Add in new copy of tool instructions.
        toolInstructions && {
          role: 'user' as const,
          content: toolInstructions,
        },

    prompt && {
      role: 'user' as const,
      content: prompt,
    },

    ...readFileMessages
  )

  const iterationNum = messagesWithUserMessage.length

  const system = getAgentSystemPrompt(fileContext)
  const systemTokens = countTokensJson(system)

  // Possibly truncated messagesWithUserMessage + cache.
  const agentMessages = getMessagesSubset(
    messagesWithUserMessage,
    systemTokens + countTokensJson({ agentContext, userInstructions })
  )

  const debugPromptCaching = false
  if (debugPromptCaching) {
    // Store the agent request to a file for debugging
    await saveAgentRequest(agentMessages, system, promptId)
  }

  logger.debug(
    {
      agentMessages,
      messagesWithoutToolResults: messagesWithUserMessage.filter(
        (m) => !isToolResult(m)
      ),
      prompt,
      agentContext,
      iteration: iterationNum,
      toolResults,
      systemTokens,
    },
    `Main prompt ${iterationNum}`
  )

  let fullResponse = ''
  const fileProcessingPromisesByPath: Record<
    string,
    Promise<{ path: string; content: string; patch?: string } | null>[]
  > = {}

  const stream =
    costMode === 'max' || costMode === 'normal'
      ? promptGeminiStream(messagesWithSystem(agentMessages, system), {
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          model: models.gemini2_5_pro,
          userId,
        })
      : promptClaudeStream(agentMessages, {
          system,
          model: getModelForMode(costMode, 'agent') as AnthropicModel,
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          userId,
        })

  const streamWithTags = processStreamWithTags(stream, {
    write_file: {
      attributeNames: [],
      onTagStart: () => {},
      onTagEnd: (body) => {
        const { path, content } = parseToolCallXml(body)
        if (!content) return false

        // Initialize state for this file path if needed
        if (!fileProcessingPromisesByPath[path]) {
          fileProcessingPromisesByPath[path] = []
        }
        const previousPromises = fileProcessingPromisesByPath[path]
        const previousEdit = previousPromises[previousPromises.length - 1]

        const latestContentPromise = previousEdit
          ? previousEdit.then(
              (maybeResult) =>
                maybeResult?.content ?? requestOptionalFile(ws, path)
            )
          : requestOptionalFile(ws, path)

        const fileContentWithoutStartNewline = content.startsWith('\n')
          ? content.slice(1)
          : content

        logger.debug({ path, content }, `write_file ${path}`)

        const newPromise = processFileBlock(
          path,
          latestContentPromise,
          fileContentWithoutStartNewline,
          messagesWithUserMessage,
          fullResponse,
          prompt,
          clientSessionId,
          fingerprintId,
          promptId,
          userId,
          costMode
        ).catch((error) => {
          logger.error(error, 'Error processing file block')
          return null
        })

        fileProcessingPromisesByPath[path].push(newPromise)

        return false
      },
    },
    ...Object.fromEntries(
      TOOL_LIST.filter((tool) => tool !== 'write_file').map((tool) => [
        tool,
        {
          attributeNames: [],
          onTagStart: () => {},
          onTagEnd: () => false,
        },
      ])
    ),
  })

  for await (const chunk of streamWithTags) {
    fullResponse += chunk
    onResponseChunk(chunk)
  }

  const messagesWithResponse = [
    ...messagesWithUserMessage,
    // (hacky) ends turn if LLM did not give a response.
    {
      role: 'assistant' as const,
      content: fullResponse || '<end_turn></end_turn>',
    },
  ]
  const toolCalls = parseToolCalls(fullResponse)
  const clientToolCalls: ClientToolCall[] = []
  const serverToolResults: ToolResult[] = []

  const agentContextPromise =
    toolCalls.length > 0
      ? updateContextFromToolCalls(agentContext, toolCalls)
      : Promise.resolve(agentContext)

  for (const toolCall of toolCalls) {
    const { name, parameters } = toolCall
    if (name === 'write_file') {
      // write_file tool calls are handled as they are streamed in.
    } else if (name === 'add_subgoal' || name === 'update_subgoal') {
      // add_subgoal and update_subgoal tool calls are handled above
    } else if (
      name === 'code_search' ||
      name === 'run_terminal_command' ||
      name === 'end_turn'
    ) {
      clientToolCalls.push({
        ...(toolCall as ClientToolCall),
        id: generateCompactId(),
      })
    } else if (name === 'read_files') {
      const paths = parameters.paths
        .split(/\s+/)
        .map((path) => path.trim())
        .filter(Boolean)

      logger.debug(toolCall, 'tool call')

      const { addedFiles, updatedFilePaths } = await getFileReadingUpdates(
        ws,
        messagesWithResponse,
        getSearchSystemPrompt(fileContext, costMode, fileRequestMessagesTokens),
        fileContext,
        null,
        {
          skipRequestingFiles: false,
          requestedFiles: paths,
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          userId,
          costMode,
        }
      )
      logger.debug(
        {
          content: parameters.paths,
          paths,
          addedFilesPaths: addedFiles.map((f) => f.path),
          updatedFilePaths,
        },
        'read_files tool call'
      )
      serverToolResults.push({
        id: generateCompactId(),
        name: 'read_files',
        result: renderReadFilesResult(addedFiles),
      })
      // } else if (name === 'find_files') {
      //   const { description } = parameters
      //   const { newFileVersions, readFilesMessage, existingNewFilePaths } =
      //     await getFileVersionUpdates(
      //       ws,
      //       messagesWithResponse,
      //       getSearchSystemPrompt(fileContext, costMode, allMessagesTokens),
      //       fileContext,
      //       description,
      //       {
      //         skipRequestingFiles: false,
      //         clientSessionId,
      //         fingerprintId,
      //         userInputId: promptId,
      //         userId,
      //         costMode,
      //       }
      //     )
      //   fileContext.fileVersions = newFileVersions
      //   if (readFilesMessage !== undefined) {
      //     onResponseChunk(`\n${readFilesMessage}`)
      //   }
      //   serverToolResults.push({
      //     id: generateCompactId(),
      //     name: 'find_files',
      //     result: `For the following request "${description}", the following files were found: ${existingNewFilePaths?.join('\n') ?? 'None'}`,
      //   })
    } else if (name === 'think_deeply') {
      const { thought } = parameters
      logger.debug(
        {
          thought,
        },
        'Thought deeply'
      )
    } else if (name === 'create_plan') {
      const { path, plan } = parameters
      logger.debug(
        {
          path,
          plan,
        },
        'Create plan'
      )
      // Add the plan file to the processing queue
      if (!fileProcessingPromisesByPath[path]) {
        fileProcessingPromisesByPath[path] = []
      }
      const change = {
        path,
        content: plan,
      }
      fileProcessingPromisesByPath[path].push(Promise.resolve(change))
    } else {
      throw new Error(`Unknown tool: ${name}`)
    }
  }

  if (Object.keys(fileProcessingPromisesByPath).length > 0) {
    onResponseChunk('Applying file changes, please wait.\n')
  }

  // Flatten all promises while maintaining order within each file path
  const fileProcessingPromises = Object.values(
    fileProcessingPromisesByPath
  ).flat()

  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== null
  )
  if (changes.length === 0 && fileProcessingPromises.length > 0) {
    onResponseChunk('No changes to existing files.\n')
  } else if (fileProcessingPromises.length > 0) {
    onResponseChunk(`\n`)
  }

  const changeToolCalls = changes.map(({ path, content, patch }) => ({
    name: 'write_file' as const,
    parameters: patch
      ? {
          type: 'patch' as const,
          path,
          content: patch,
        }
      : {
          type: 'file' as const,
          path,
          content,
        },
    id: generateCompactId(),
  }))
  clientToolCalls.unshift(...changeToolCalls)

  // If no tool calls were generated by the LLM or file processing, add end_turn
  if (toolCalls.length === 0 && fileProcessingPromises.length === 0) {
    clientToolCalls.push({
      id: generateCompactId(),
      name: 'end_turn',
      parameters: {},
    })
    logger.debug('Added end_turn because no other tool calls were made.')
  }
  const newAgentContext = await agentContextPromise

  const newAgentState: AgentState = {
    ...agentState,
    messageHistory: messagesWithResponse,
    agentContext: newAgentContext,
    lastUserPromptIndex: prompt
      ? messagesWithUserMessage.length - 1
      : agentState.lastUserPromptIndex,
  }

  logger.debug(
    {
      iteration: iterationNum,
      prompt,
      fullResponse,
      toolCalls,
      clientToolCalls,
      serverToolResults,
      agentContext: newAgentContext,
      messagesWithResponse,
    },
    `Main prompt response ${iterationNum}`
  )
  return {
    agentState: newAgentState,
    toolCalls: clientToolCalls,
    toolResults: serverToolResults,
  }
}

const getInitialFiles = (fileContext: ProjectFileContext) => {
  const { userKnowledgeFiles, knowledgeFiles } = fileContext
  return [
    // Include user-level knowledge files.
    ...Object.entries(userKnowledgeFiles ?? {}).map(([path, content]) => ({
      path,
      content,
    })),

    // Include top-level project knowledge files.
    ...Object.entries(knowledgeFiles)
      .map(([path, content]) => ({
        path,
        content,
      }))
      // Only keep top-level knowledge files.
      .filter((f) => f.path.split('/').length === 1),
  ]
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

  return filePaths.length === 0 ? undefined : readFilesMessage
}

async function getFileReadingUpdates(
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
  const FILE_TOKEN_BUDGET = 100_000
  const {
    skipRequestingFiles,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
  } = options

  const toolResults = messages
    .filter(isToolResult)
    .flatMap((content) => parseToolResults(toContentString(content)))
  const previousFileList = toolResults
    .filter(({ name }) => name === 'read_files')
    .flatMap(({ result }) => parseReadFilesResult(result))

  const previousFiles = Object.fromEntries(
    previousFileList.map(({ path, content }) => [path, content])
  )
  const previousFilePaths = uniq(Object.keys(previousFiles))

  const editedFilePaths = messages
    .map(toContentString)
    .filter((content) => content.includes('<write_file'))
    .flatMap((content) => Object.keys(parseFileBlocks(content)))
    .filter((path) => path !== undefined)

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

  const isFirstRead = previousFileList.length === 0
  const initialFiles = getInitialFiles(fileContext)
  const includedInitialFiles = isFirstRead
    ? initialFiles.map(({ path }) => path)
    : []

  const allFilePaths = uniq([
    ...includedInitialFiles,
    ...requestedFiles,
    ...editedFilePaths,
    ...previousFilePaths,
  ])
  const loadedFiles = await requestFiles(ws, allFilePaths)

  const filteredRequestedFiles = requestedFiles.filter((filePath, i) => {
    const content = loadedFiles[filePath]
    if (content === null || content === undefined) return false
    const tokenCount = countTokens(content)
    if (i < 5) {
      return tokenCount < 50_000 - i * 10_000
    }
    return tokenCount < 10_000
  })
  const newFiles = difference(
    [...filteredRequestedFiles, ...includedInitialFiles],
    previousFilePaths
  )
  const newFilesToRead = uniq([
    // NOTE: When the assistant specifically asks for a file, we force it to be shown even if it's not new or changed.
    ...(options.requestedFiles ?? []),

    ...newFiles,
  ])

  const updatedFilePaths = [...previousFilePaths, ...editedFilePaths].filter(
    (path) => {
      return loadedFiles[path] !== previousFiles[path]
    }
  )

  const addedFiles = uniq([
    ...includedInitialFiles,
    ...updatedFilePaths,
    ...newFilesToRead,
  ])
    .map((path) => {
      return {
        path,
        content: loadedFiles[path]!,
      }
    })
    .filter((file) => file.content !== null)

  const previousFilesTokens = countTokensJson(previousFiles)
  const addedFileTokens = countTokensJson(addedFiles)

  if (previousFilesTokens + addedFileTokens > FILE_TOKEN_BUDGET) {
    const requestedLoadedFiles = filteredRequestedFiles.map((path) => ({
      path,
      content: loadedFiles[path]!,
    }))
    const newFiles = uniq([...initialFiles, ...requestedLoadedFiles])
    while (countTokensJson(newFiles) > FILE_TOKEN_BUDGET) {
      newFiles.pop()
    }

    const printedPaths = getPrintedPaths(
      requestedFiles,
      newFilesToRead,
      loadedFiles
    )
    const isFirstRead = true
    const readFilesMessage = getRelevantFileInfoMessage(
      printedPaths,
      isFirstRead
    )

    logger.debug(
      {
        newFiles,
        prevFileVersionTokens: previousFilesTokens,
        addedFileTokens,
        beforeTotalTokens: previousFilesTokens + addedFileTokens,
        newFileVersionTokens: countTokensJson(newFiles),
        FILE_TOKEN_BUDGET,
      },
      'resetting read files b/c of token budget'
    )

    return {
      addedFiles: newFiles,
      updatedFilePaths: updatedFilePaths,
      readFilesMessage,
      clearReadFileToolResults: true,
    }
  }

  const printedPaths = getPrintedPaths(
    requestedFiles,
    newFilesToRead,
    loadedFiles
  )
  const readFilesMessage =
    printedPaths.length > 0
      ? getRelevantFileInfoMessage(printedPaths, isFirstRead)
      : undefined

  return {
    addedFiles,
    updatedFilePaths,
    readFilesMessage,
    clearReadFileToolResults: false,
  }
}

function getPrintedPaths(
  requestedFiles: string[],
  newFilesToRead: string[],
  loadedFiles: Record<string, string | null>
) {
  // If no files requests, we don't want to print anything.
  // Could still have files added from initial files or edited files.
  if (requestedFiles.length === 0) return []
  // Otherwise, only print files that don't start with a hidden file status.
  return newFilesToRead.filter(
    (path) =>
      loadedFiles[path] &&
      !HIDDEN_FILE_READ_STATUS.some((status) =>
        loadedFiles[path]!.startsWith(status)
      )
  )
}

function getMessagesSubset(messages: Message[], otherTokens: number) {
  const indexLastSubgoalComplete = messages.findLastIndex(({ content }) => {
    JSON.stringify(content).includes('COMPLETE')
  })

  const messagesSubset = trimMessagesToFitTokenLimit(
    indexLastSubgoalComplete === -1
      ? messages
      : messages.slice(indexLastSubgoalComplete),
    otherTokens
  )

  // Remove cache_control from all messages
  for (const message of messagesSubset) {
    if (typeof message.content === 'object' && message.content.length > 0) {
      delete message.content[message.content.length - 1].cache_control
    }
  }

  // Cache up to the last message!
  const lastMessage = messagesSubset[messagesSubset.length - 1]
  if (lastMessage) {
    messagesSubset[messagesSubset.length - 1] = withCacheControl(lastMessage)
  } else {
    logger.debug(
      {
        messages,
        messagesSubset,
        otherTokens,
      },
      'No last message found in messagesSubset!'
    )
  }

  return messagesSubset
}
