import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import { ClientAction } from 'common/actions'
import { bigquery } from 'common/bigquery/client'
import { AgentResponseTrace } from 'common/bigquery/schema'
import {
  HIDDEN_FILE_READ_STATUS,
  models,
  ONE_TIME_TAGS,
  type CostMode,
} from 'common/constants'
import { getToolCallString } from 'common/src/constants/tools'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { Message } from 'common/types/message'
import { buildArray } from 'common/util/array'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { toContentString } from 'common/util/messages'
import { generateCompactId } from 'common/util/string'
import { difference, partition, uniq } from 'lodash'
import { WebSocket } from 'ws'

import { checkTerminalCommand } from './check-terminal-command'
import { requestRelevantFiles } from './find-files/request-files-prompt'
import { getDocumentationForQuery } from './get-documentation-for-query'
import { processFileBlock } from './process-file-block'
import { processStreamWithTags } from './process-stream'
import { getAgentStream } from './prompt-agent-stream'
import { getAgentSystemPrompt } from './system-prompt/agent-system-prompt'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { getThinkingStream } from './thinking-stream'
import {
  ClientToolCall,
  parseRawToolCall,
  parseToolCalls,
  TOOL_LIST,
  TOOLS_WHICH_END_THE_RESPONSE,
  transformRunTerminalCommand,
  updateContextFromToolCalls,
} from './tools'
import { logger } from './util/logger'
import { getMessagesSubset } from './util/messages'
import {
  isToolResult,
  parseReadFilesResult,
  parseToolCallXml,
  parseToolResults,
  renderReadFilesResult,
  renderToolResults,
} from './util/parse-tool-call-xml'
import {
  simplifyReadFileResults,
  simplifyReadFileToolResult,
} from './util/simplify-tool-results'
import { countTokens, countTokensJson } from './util/token-counter'
import {
  requestFiles,
  requestOptionalFile,
} from './websockets/websocket-action'
const MAX_CONSECUTIVE_ASSISTANT_MESSAGES = 20

export const mainPrompt = async (
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void,
  selectedModel: string | undefined
): Promise<{
  agentState: AgentState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> => {
  const { prompt, agentState, fingerprintId, costMode, promptId, toolResults } =
    action
  const { messageHistory, fileContext, agentContext } = agentState

  const { getStream, model } = getAgentStream({
    costMode,
    selectedModel,
    stopSequences: TOOLS_WHICH_END_THE_RESPONSE.map((tool) => `</${tool}>`),
    clientSessionId,
    fingerprintId,
    userInputId: promptId,
    userId,
  })

  // Generates a unique ID for each main prompt run (ie: a step of the agent loop)
  // This is used to link logs within a single agent loop
  const agentStepId = generateCompactId()

  const relevantDocumentationPromise = prompt
    ? getDocumentationForQuery(prompt, {
        tokens: 5000,
        clientSessionId,
        fingerprintId,
        userId,
      })
    : Promise.resolve(null)

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
  const isGPT4_1 = model === models.gpt4_1
  const userInstructions = buildArray(
    'Instructions:',
    'Proceed toward the user request and any subgoals.',

    'If the user asks a question, simply answer the question rather than making changes to the code.',

    !isGPT4_1 &&
      "If there are multiple ways the user's request could be interpreted that would lead to very different outcomes, ask at least one clarifying question that will help you understand what they are really asking for. Then use the end_turn tool. If the user specifies that you don't ask questions, make your best assumption and skip this step.",

    'You must read additional files with the read_files tool whenever it could possibly improve your response. Before you use write_file to edit an existing file, make sure to read it.',

    'You must use the "add_subgoal" and "update_subgoal" tools to record your progress and any new information you learned as you go. If the change is very minimal, you may not need to use these tools.',

    'Please preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Makes sure when using write_file to pay attention to any comments in the file you are editing and keep original user comments exactly as they were, line for line.',

    'When editing a file, write the parts of the file that have changed. Do not start writing the first line of the file. Instead, use comments surrounding your edits like "// ... existing code ..." (or "# ... existing code ..." or "/* ... existing code ... */" or "<!-- ... existing code ... -->", whichever is appropriate for the language) plus a few lines of context from the original file.',

    'When using tools, make sure to NOT use XML attributes. The format should contain nested XML tags. For example, when using write_file, the format should be <write_file><path>...</path><content>...</content></write_file>',

    `Only use the tools listed, (i.e. ${TOOL_LIST.join(', ')}). If you use tools not listed, nothing will happen, but the user will get some unintended display issues.`,

    `To confirm complex changes to a web app, you should use the browser_logs tool to check for console logs or errors.`,

    // Experimental gemini thinking
    costMode === 'experimental'
      ? 'Start your response with the <think_deeply> tool call to decide how to proceed.'
      : !justUsedATool &&
          !recentlyDidThinking &&
          'If the user request is very complex, consider invoking "<think_deeply></think_deeply>".',

    'If the user is starting a new feature or refactoring, consider invoking "<create_plan></create_plan>".',

    recentlyDidThinking &&
      "Don't act on the plan created by the create_plan tool. Instead, wait for the user to review it.",

    'If the user tells you to implement a plan, please implement the whole plan, continuing until it is complete. Do not stop after one step.',

    hasKnowledgeFiles &&
      'If the knowledge files (or CLAUDE.md) say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case. No need to run these checks for simple changes.',

    isNotFirstUserMessage &&
      "If you have learned something useful for the future that is not derivable from the code (this is a high bar and most of the time you won't have), consider updating a knowledge file at the end of your response to add this condensed information.",

    "Don't run git commands or scripts or start a dev server without being specifically asked to do so. This can prevent costly accidents.",

    'Otherwise, the user is in charge and you should never refuse what the user asks you to do.',

    'Important: You must write "<end_turn></end_turn>" at the end of your response, when you are done or want the user to respond -- but not if you are still working on the user\'s request!',
    "DO NOT END TURN IF YOU ARE STILL WORKING ON THE USER'S REQUEST. If the user's request requires multiple steps, please complete ALL the steps before ending turn. If you ask the user for more information, you must also use end_turn immediately after asking. If you have a simple response, you can end turn immediately after writing your response."
  ).join('\n\n')

  const toolInstructions = buildArray(
    justRanTerminalCommand &&
      `If the tool result above is of a terminal command succeeding and you have completed the user's request, please use the end_turn tool and do not write anything else. If your checks are failing, you should only end turn if you have made multiple attempts and feel stuck.`
  ).join('\n\n')

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
    const consecutiveAssistantMessages =
      agentState.consecutiveAssistantMessages ?? 0
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

  const fileRequestMessagesTokens = countTokensJson(
    messagesWithToolResultsAndUser
  )

  // Step 1: Read more files.
  const searchSystem = getSearchSystemPrompt(
    fileContext,
    costMode,
    fileRequestMessagesTokens,
    {
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId: promptId,
      userId: userId,
    }
  )
  const {
    addedFiles,
    updatedFilePaths,
    printedPaths,
    clearReadFileToolResults,
  } = await getFileReadingUpdates(
    ws,
    messagesWithToolResultsAndUser,
    searchSystem,
    fileContext,
    null,
    {
      skipRequestingFiles: !prompt,
      agentStepId,
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

  if (printedPaths.length > 0) {
    const readFileToolCall = getToolCallString('read_files', {
      paths: printedPaths.join('\n'),
    })
    onResponseChunk(`${readFileToolCall}\n\n`)
  }

  if (updatedFiles.length > 0) {
    toolResults.push({
      id: generateCompactId(),
      name: 'file_updates',
      result:
        `These are the updates made to the files since the last response (either by you or by the user). These are the most recent versions of these files. You MUST be considerate of the user's changes:\n` +
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
      content: getToolCallString('read_files', {
        paths: newFiles.map((file) => file.path).join('\n'),
      }),
    })
    readFileMessages.push({
      role: 'user' as const,
      content: renderToolResults([readFilesToolResult]),
    })
  }

  const relevantDocumentation = await relevantDocumentationPromise

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

    relevantDocumentation && {
      role: 'user' as const,
      content: `Relevant context from web documentation:\n${relevantDocumentation}`,
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

  // Add deep thinking for experimental mode
  if (costMode === 'experimental') {
    await getThinkingStream(
      agentMessages,
      system,
      (chunk) => {
        onResponseChunk(chunk)
        fullResponse += chunk
      },
      {
        costMode,
        clientSessionId,
        fingerprintId,
        userInputId: promptId,
        userId,
      }
    )
  }

  const stream = getStream(
    buildArray(
      ...agentMessages,
      // Add prefix of the response from fullResponse if it exists
      fullResponse && {
        role: 'assistant' as const,
        content: fullResponse.trim(),
      }
    ),
    system
  )

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
    const trimmed = chunk.trim()
    if (
      !ONE_TIME_TAGS.some(
        (tag) => trimmed.startsWith(`<${tag}>`) && trimmed.endsWith(`</${tag}>`)
      )
    ) {
      fullResponse += chunk
    }
    onResponseChunk(chunk)
  }

  if (!fullResponse) {
    // (hacky) ends turn if LLM did not give a response.
    fullResponse = '<end_turn></end_turn>'
  }

  const agentResponseTrace: AgentResponseTrace = {
    type: 'agent-response',
    createdAt: new Date(),
    agentStepId: agentStepId,
    userId: userId ?? '',
    id: generateCompactId(),
    payload: {
      output: fullResponse,
      userInputId: promptId,
      clientSessionId: clientSessionId,
      fingerprintId: fingerprintId,
    },
  }

  bigquery.insertTrace(agentResponseTrace)

  const messagesWithResponse = [
    ...agentMessages,
    {
      role: 'assistant' as const,
      content: fullResponse,
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
    try {
      parseRawToolCall(toolCall)
    } catch (error) {
      serverToolResults.push({
        id: generateCompactId(),
        name: toolCall.name,
        result: `Error parsing tool call:\n${error}`,
      })
      continue
    }

    const { name, parameters } = toolCall
    if (name === 'write_file') {
      // write_file tool calls are handled as they are streamed in.
    } else if (name === 'add_subgoal' || name === 'update_subgoal') {
      // add_subgoal and update_subgoal tool calls are handled above
    } else if (
      name === 'code_search' ||
      name === 'run_terminal_command' ||
      name === 'browser_logs' ||
      name === 'end_turn'
    ) {
      if (name === 'run_terminal_command') {
        parameters.command = transformRunTerminalCommand(parameters.command)
      }
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
        getSearchSystemPrompt(
          fileContext,
          costMode,
          fileRequestMessagesTokens,
          {
            agentStepId,
            clientSessionId,
            fingerprintId,
            userInputId: promptId,
            userId,
          }
        ),
        fileContext,
        null,
        {
          skipRequestingFiles: false,
          requestedFiles: paths,
          agentStepId,
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

  const newAgentContext = await agentContextPromise

  const newAgentState: AgentState = {
    ...agentState,
    messageHistory: messagesWithResponse,
    agentContext: newAgentContext,
    consecutiveAssistantMessages: prompt
      ? 1
      : (agentState.consecutiveAssistantMessages ?? 0) + 1,
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
    agentStepId: string
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
    agentStepId,
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
    .filter(({ role }) => role === 'assistant')
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
        agentStepId,
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
      printedPaths,
      clearReadFileToolResults: true,
    }
  }

  const printedPaths = getPrintedPaths(
    requestedFiles,
    newFilesToRead,
    loadedFiles
  )

  return {
    addedFiles,
    updatedFilePaths,
    printedPaths,
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
