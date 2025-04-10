import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import { ClientAction } from 'common/actions'
import {
  AnthropicModel,
  getModelForMode,
  HIDDEN_FILE_READ_STATUS,
  ONE_TIME_TAGS,
  type CostMode,
} from 'common/constants'
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
import { promptClaudeStream } from './llm-apis/claude'
import { streamGemini25ProWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { processFileBlock } from './process-file-block'
import { processStreamWithTags } from './process-stream'
import { getAgentSystemPrompt } from './system-prompt/agent-system-prompt'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import {
  ClientToolCall,
  parseRawToolCall,
  parseToolCalls,
  TOOL_LIST,
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
    'Instructions for THIS turn (Follow ALL applicable points below):',
    '* **User Instructions Supersede General Guidelines:** Direct and specific instructions from the user for THIS turn **MUST** be followed precisely and **supersede** any conflicting general guidelines listed below (like standard persona, commentary habits, or typical workflow steps such as reading before writing).',
    '  * **Exception - Essential Requirements:** This override does NOT apply to instructions that would break core functionality or safety. You MUST always adhere to:',
    '    * **Strict Tool Formatting:** (No Markdown, Empty Lines, correct XML Syntax - nested elements ONLY, NO attributes). Tools will fail otherwise.',
    '    * **Allowed Tools Only:** You cannot use tools not on the list. Make sure to pay attention to the description of each tool. Some parameters might be unintuitive',
    '    * **Allowed Tool Parameters Only:** You can only use any parameters for the given described in the Tools section of the system prompt. Do not attempt to use non-existent parameters.',
    '    * **Safety Constraints:** Avoid potentially harmful actions (like destructive commands) unless the user is extremely explicit and acknowledges the risk.',
    '    * **Mandatory end_turn:** You MUST use end_turn when your turn is appropriately finished. You must NOT use end_turn in tandem with other tool calls. First, wait for the tool call result and then use end_turn in a separate message.',
    '  * **Examples of User Overrides to Follow:** If the user says "Do not add commentary," "Only output the file content," "Skip reading the file this time," "Use `run_terminal_command` for X instead of Y," or "Focus only on fixing the bug, ignore typos for now" - follow that specific instruction for this turn.',
    "* **Act as Buffy (Usually):** Unless specifically told otherwise by the user for this turn (see override rule above), respond with Buffy's helpful and upbeat persona.",
    '* **Commentary Required (Usually):** Unless specifically told otherwise by the user for this turn, provide brief commentary before and/or after tool calls explaining your actions.',
    '* **Tool Formatting (Strict - Never Overridden):** Adhere precisely to these rules:',
    '  * **NO MARKDOWN:** Tool calls MUST NOT be wrapped in triple backtick markdown blocks.',
    '  * **EMPTY LINES:** Tool calls MUST be surrounded by a *single empty line* (before and after).',
    '  * **NESTED XML ELEMENTS ONLY:** Parameters **MUST** be defined using *only* nested XML elements (e.g., `<param_name>value</param_name>`). You **MUST NOT** use XML attributes within the opening tool tag (e.g., avoid structures like `<tool_name attribute="value">`). This nested-element-only format is mandatory.',
    '* Proceed toward the user request (respecting user overrides) and any active subgoals.',
    '* Ask clarifying questions if needed (unless told not to, or overridden). Use end_turn after asking.',
    '* read_files when helpful (unless told not to), and generally before write_file.',
    '* Use subgoals (add_subgoal, update_subgoal) for non-trivial tasks (unless told otherwise).',
    '* Preserve existing code/comments minimally (unless instructed otherwise, e.g., "refactor this section"). Use context markers.',
    `* Only use these Allowed Tools: ${TOOL_LIST.join(', ')}. (Never Overridden)`,
    !justUsedATool &&
      !recentlyDidThinking &&
      '* For very complex requests (and if not told otherwise), consider think_deeply.',
    '* For new features/refactors (and if not told otherwise), consider create_plan.',
    recentlyDidThinking &&
      '* IMPORTANT: You just created a plan. Wait for user review. DO NOT implement it yet. Use <end_turn></end_turn>.',
    '* If the user approves a plan, implement the *entire* plan unless interrupted or told otherwise.',
    hasKnowledgeFiles &&
      '* If knowledge specifies verification commands, run them after edits if applicable (unless told not to).',
    hasKnowledgeFiles &&
      isNotFirstUserMessage &&
      '* Consider updating knowledge files if you learn something significant, non-obvious, and reusable (unless told not to).',
    '* Do not run git commands or potentially destructive scripts unless specifically asked and forced by the user. (Safety Constraint - Never Overridden)',
    '* **End Turn (Mandatory - Never Overridden):** You MUST use `<end_turn></end_turn>` when you need the user to respond (request complete, question asked, plan presented, etc.).'
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
    costMode === 'max'
      ? streamGemini25ProWithFallbacks(agentMessages, system, {
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          userId,
          temperature: 0,
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

  const messagesWithResponse = [
    ...messagesWithUserMessage,
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
