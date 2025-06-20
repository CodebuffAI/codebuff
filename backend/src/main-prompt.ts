import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import {
  AgentResponseTrace,
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { ClientAction } from 'common/actions'
import {
  HIDDEN_FILE_READ_STATUS,
  Model,
  ONE_TIME_LABELS,
  type CostMode,
} from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { trackEvent } from 'common/src/analytics'
import { SessionState } from 'common/types/session-state'
import { buildArray } from 'common/util/array'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { toContentString } from 'common/util/messages'
import { generateCompactId } from 'common/util/string'
import { difference, partition, uniq } from 'lodash'
import { WebSocket } from 'ws'

import { CoreMessage, ToolCallPart } from 'ai'
import assert from 'assert'
import { CodebuffMessage } from 'common/types/message'
import { checkTerminalCommand } from './check-terminal-command'
import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from './find-files/request-files-prompt'
import { processFileBlock } from './process-file-block'
import { processStrReplace } from './process-str-replace'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { research } from './research'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { agentTemplates } from './templates/agent-list'
import { getAgentPrompt } from './templates/strings'
import {
  ClientToolCall,
  CodebuffToolCall,
  parseRawToolCall,
  updateContextFromToolCalls,
} from './tools'
import { logger } from './util/logger'
import { asSystemMessage, asUserMessage, expireMessages } from './util/messages'
import {
  isToolResult,
  parseReadFilesResult,
  parseToolResults,
  renderToolResults,
} from './util/parse-tool-call-xml'
import { countTokens, countTokensJson } from './util/token-counter'
import { getRequestContext } from './websockets/request-context'
import {
  requestFiles,
  requestOptionalFile,
} from './websockets/websocket-action'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

export interface MainPromptOptions {
  userId: string | undefined
  clientSessionId: string
  onResponseChunk: (chunk: string) => void
  selectedModel: string | undefined
  readOnlyMode?: boolean
  modelConfig?: { agentModel?: Model; reasoningModel?: Model } // Used by the backend for automatic evals
}

export const mainPrompt = async (
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  options: MainPromptOptions
): Promise<{
  sessionState: SessionState
  toolCalls: Array<ClientToolCall>
}> => {
  const {
    userId: maybeUserId,
    clientSessionId,
    onResponseChunk,
    selectedModel,
    readOnlyMode = false,
    modelConfig,
  } = options

  const {
    prompt,
    sessionState: sessionState,
    fingerprintId,
    costMode,
    promptId: userInputId,
    toolResults,
  } = action
  const { fileContext, mainAgentState: agentState } = sessionState
  const { agentContext, messageHistory, agentId, stepsRemaining } = agentState
  const userId = maybeUserId ?? ''
  const isMainAgent = true

  const startTime = Date.now()

  // Get the extracted repo ID from request context
  const requestContext = getRequestContext()
  const repoName = requestContext?.processedRepoId

  const agentType = agentState.agentType ?? 'gemini25pro_base'
  agentState.agentType = agentType

  const template = agentTemplates[agentType]
  const { model } = template

  const getStreamWithTools = getAgentStreamFromTemplate({
    template,
    clientSessionId,
    userId,
    userInputId,
    fingerprintId,
  })

  const agentStepId = generateCompactId(`${agentId}-step-`)
  trackEvent(AnalyticsEvent.AGENT_STEP, userId, {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoName,
    agentType,
    agentId,
  })

  const iterationNum = messageHistory.length

  const renderedToolResults = renderToolResults(toolResults)
  const messagesWithToolResults = buildArray<CodebuffMessage>([
    ...messageHistory,
    toolResults.length > 0 && {
      role: 'user' as const,
      content: asSystemMessage(renderedToolResults),
    },
  ])

  const messagesWithToolResultsAndUser = buildArray<CodebuffMessage>(
    ...messagesWithToolResults,
    prompt && [
      {
        role: 'user' as const,
        content: asSystemMessage(
          `Assistant cwd (project root): ${fileContext.projectRoot}\nUser cwd: ${fileContext.cwd}`
        ),
        timeToLive: 'agentStep',
      },
      {
        role: 'user' as const,
        content: asUserMessage(prompt),
      },
    ]
  )

  console.log('asdf', { messagesWithToolResultsAndUser })

  if (prompt) {
    // Check if this is a direct terminal command
    const startTime = Date.now()
    const terminalCommand = await checkTerminalCommand(prompt, {
      clientSessionId,
      fingerprintId,
      userInputId,
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
      const newSessionState = {
        ...sessionState,
        mainAgentState: {
          ...agentState,
          messageHistory: expireMessages(
            messagesWithToolResultsAndUser,
            'userPrompt'
          ),
        },
      }
      return {
        sessionState: newSessionState,
        toolCalls: [
          {
            toolName: 'run_terminal_command',
            toolCallId: generateCompactId(),
            args: {
              command: terminalCommand,
              mode: 'user',
              process_type: 'SYNC',
              timeout_seconds: '-1',
            },
          },
        ],
      }
    }
  }

  if (stepsRemaining <= 0) {
    logger.warn(
      `Detected too many consecutive assistant messages without user prompt`
    )

    if (isMainAgent) {
      const warningString = [
        "I've made quite a few responses in a row.",
        "Let me pause here to make sure we're still on the right track.",
        "Please let me know if you'd like me to continue or if you'd like to guide me in a different direction.",
      ].join(' ')

      onResponseChunk(`${warningString}\n\n`)
    }

    return {
      sessionState: {
        ...sessionState,
        mainAgentState: {
          ...agentState,
          messageHistory: [
            ...expireMessages(messagesWithToolResultsAndUser, 'userPrompt'),
            {
              role: 'user',
              content: asSystemMessage(
                `The assistant has responded too many times in a row. The assistant's turn has automatically been ended.`
              ),
            },
          ],
        },
      },
      toolCalls: [],
    }
  }

  const messagesWithEphemeralMessages = buildArray<CodebuffMessage>([
    ...expireMessages(
      messagesWithToolResults,
      prompt ? 'userPrompt' : 'agentStep'
    ),
    prompt && [
      { role: 'user' as const, content: asUserMessage(prompt) },
      {
        role: 'user' as const,
        content: getAgentPrompt(
          agentType,
          'userInputPrompt',
          fileContext,
          agentState
        ),
        timeToLive: 'userPrompt',
      },
    ],
    !prompt && {
      role: 'user' as const,
      content: getAgentPrompt(
        agentType,
        'agentStepPrompt',
        fileContext,
        agentState
      ),
      timeToLive: 'agentStep',
    },
  ])

  // Accumulators for stream
  const fullResponse: CodebuffMessage[] = []
  let responseBuffer = ''
  function flushResponseBuffer() {
    if (responseBuffer) {
      fullResponse.push({ role: 'assistant', content: responseBuffer })
      responseBuffer = ''
    }
  }
  function addToolCallWithResponse(
    toolCall: CodebuffToolCall,
    toolResult: any
  ) {
    flushResponseBuffer()
    fullResponse.push(
      { role: 'assistant', content: [{ type: 'tool-call', ...toolCall }] },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            result: toolResult,
          },
        ],
      }
    )
  }
  const fileProcessingPromisesByPath: Record<
    string,
    Promise<
      {
        tool: 'write_file' | 'str_replace' | 'create_plan'
        path: string
        toolCall: CodebuffToolCall & {
          toolName: 'write_file' | 'str_replace' | 'create_plan'
        }
      } & (
        | {
            content: string
            patch?: string
          }
        | {
            error: string
          }
      )
    >[]
  > = {}
  const clientToolCalls: ClientToolCall[] = []
  const subgoalToolCalls: (CodebuffToolCall & {
    toolName: 'add_subgoal' | 'update_subgoal'
  })[] = []
  const remainingToolCalls: (CodebuffToolCall & {
    toolName: 'read_files' | 'find_files' | 'research'
  })[] = []

  // Process stream
  for await (const chunk of getStreamWithTools([
    {
      role: 'system',
      content: getAgentPrompt(
        agentType,
        'systemPrompt',
        fileContext,
        agentState
      ),
    },
    ...messagesWithEphemeralMessages,
  ])) {
    if (typeof chunk === 'string') {
      if (
        !ONE_TIME_LABELS.some(
          (tag) => chunk.startsWith(`<${tag}>`) && chunk.endsWith(`</${tag}>`)
        )
      ) {
        responseBuffer += chunk
      }
      onResponseChunk(chunk)
      continue
    }

    const toolCall = parseRawToolCall(
      chunk as ToolCallPart & { args: Record<string, string> }
    )
    if ('error' in toolCall) {
      fullResponse.push(
        { role: 'assistant', content: [chunk] },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              result: toolCall.error,
            },
          ],
        }
      )
      continue
    }

    processSpecificToolCall: if (toolCall.toolName === 'think_deeply') {
      addToolCallWithResponse(toolCall, '')
      logger.debug({ thought: toolCall.args.thought }, 'Thought deeply')
    } else if (
      toolCall.toolName === 'add_subgoal' ||
      toolCall.toolName === 'update_subgoal'
    ) {
      subgoalToolCalls.push(toolCall)
    } else if (
      toolCall.toolName === 'code_search' ||
      toolCall.toolName === 'browser_logs' ||
      toolCall.toolName === 'end_turn'
    ) {
      clientToolCalls.push(toolCall)
    } else if (toolCall.toolName === 'run_terminal_command') {
      clientToolCalls.push({
        ...toolCall,
        args: {
          ...toolCall.args,
          mode: 'assistant' as const,
        },
      })
    } else if (toolCall.toolName === 'create_plan') {
      const { path, plan } = toolCall.args
      logger.debug({ path, plan }, 'Created plan')

      // Add the plan file to the processing queue
      if (!fileProcessingPromisesByPath[path]) {
        fileProcessingPromisesByPath[path] = []
        if (path.endsWith('knowledge.md')) {
          trackEvent(AnalyticsEvent.KNOWLEDGE_FILE_UPDATED, userId ?? '', {
            agentStepId,
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
            repoName,
          })
        }
      }
      const change = {
        tool: 'create_plan' as const,
        toolCall,
        path,
        content: plan,
      }
      fileProcessingPromisesByPath[path].push(Promise.resolve(change))
    } else if (toolCall.toolName === 'write_file') {
      const { path, instructions, content } = toolCall.args
      if (!content) {
        break processSpecificToolCall
      }

      // Initialize state for this file path if needed
      if (!fileProcessingPromisesByPath[path]) {
        fileProcessingPromisesByPath[path] = []
      }
      const editsForFile = fileProcessingPromisesByPath[path]
      const previousPromise = editsForFile[editsForFile.length - 1]

      const latestContentPromise = previousPromise
        ? previousPromise.then((maybeResult) =>
            maybeResult && 'content' in maybeResult
              ? maybeResult.content
              : requestOptionalFile(ws, path)
          )
        : requestOptionalFile(ws, path)

      const fileContentWithoutStartNewline = content.startsWith('\n')
        ? content.slice(1)
        : content

      logger.debug({ path, content }, `write_file ${path}`)

      const changePromise = processFileBlock(
        path,
        instructions,
        latestContentPromise,
        fileContentWithoutStartNewline,
        expireMessages(messagesWithEphemeralMessages, 'userPrompt'),
        fullResponse
          .filter((m) => typeof m.content === 'string')
          .map((m) => m.content)
          .join('\n\n'),
        prompt,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        'normal'
      )
        .catch((error) => {
          logger.error(error, 'Error processing write_file block')
          return {
            tool: 'write_file' as const,
            path,
            error: `Error: Failed to process the write_file block. ${typeof error === 'string' ? error : error.msg}`,
          }
        })
        .then((result) => {
          return { ...result, toolCall }
        })

      fileProcessingPromisesByPath[path].push(changePromise)
    } else if (toolCall.toolName === 'str_replace') {
      const { path, old_vals, new_vals } = toolCall.args
      if (old_vals.length !== new_vals.length) {
        addToolCallWithResponse(
          toolCall,
          'Error: old_vals and new_vals must have the same number of elements.'
        )
        break processSpecificToolCall
      }

      if (!fileProcessingPromisesByPath[path]) {
        fileProcessingPromisesByPath[path] = []
      }
      const previousPromises = fileProcessingPromisesByPath[path]
      const previousEdit = previousPromises[previousPromises.length - 1]

      const latestContentPromise = previousEdit
        ? previousEdit.then((maybeResult) =>
            maybeResult && 'content' in maybeResult
              ? maybeResult.content
              : requestOptionalFile(ws, path)
          )
        : requestOptionalFile(ws, path)

      const changePromise = processStrReplace(
        path,
        old_vals,
        new_vals || [],
        latestContentPromise
      )
        .catch((error: any) => {
          logger.error(error, 'Error processing str_replace block')
          return {
            tool: 'str_replace' as const,
            path,
            error: 'Unknown error: Failed to process the str_replace block.',
          }
        })
        .then((result) => {
          return { ...result, toolCall }
        })

      fileProcessingPromisesByPath[path].push(changePromise)
    } else if (
      toolCall.toolName === 'read_files' ||
      toolCall.toolName === 'find_files' ||
      toolCall.toolName === 'research'
    ) {
      remainingToolCalls.push(toolCall)
    } else {
      toolCall satisfies never
      assert(false, `Unknown tool name for tool: ${{ toolCall }}`)
    }
  }
  flushResponseBuffer()

  const agentResponseTrace: AgentResponseTrace = {
    type: 'agent-response',
    created_at: new Date(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    id: crypto.randomUUID(),
    payload: {
      output: fullResponse
        .filter((m) => typeof m.content === 'string')
        .map((m) => m.content)
        .join('\n\n'),
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
    },
  }

  insertTrace(agentResponseTrace)

  const messagesWithResponse = [
    ...messagesWithEphemeralMessages,
    ...fullResponse,
  ]
  const tokensWithResponse = countTokensJson(messagesWithResponse)

  const agentContextPromise =
    subgoalToolCalls.length > 0
      ? updateContextFromToolCalls(agentContext, subgoalToolCalls)
      : Promise.resolve(agentContext)

  for (const toolCall of remainingToolCalls) {
    const { toolName: name, args: parameters } = toolCall
    trackEvent(AnalyticsEvent.TOOL_USE, userId ?? '', {
      tool: name,
      parameters,
    })
    if (toolCall.toolName === 'read_files') {
      const paths = (
        toolCall as Extract<CodebuffToolCall, { toolName: 'read_files' }>
      ).args.paths
        .split(/\s+/)
        .map((path: string) => path.trim())
        .filter(Boolean)

      const { addedFiles, updatedFilePaths } = await getFileReadingUpdates(
        ws,
        messagesWithResponse,
        getSearchSystemPrompt(fileContext, costMode, tokensWithResponse, {
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
        }),
        fileContext,
        null,
        {
          skipRequestingFiles: false,
          requestedFiles: paths,
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          costMode,
          repoId: repoName,
        }
      )
      logger.debug(
        {
          content: paths,
          paths,
          addedFilesPaths: addedFiles.map((f) => f.path),
          updatedFilePaths,
        },
        'read_files tool call'
      )
      addToolCallWithResponse(toolCall, addedFiles)
    } else if (toolCall.toolName === 'find_files') {
      const description = (
        toolCall as Extract<CodebuffToolCall, { toolName: 'find_files' }>
      ).args.description
      const { addedFiles, updatedFilePaths, printedPaths } =
        await getFileReadingUpdates(
          ws,
          messagesWithResponse,
          getSearchSystemPrompt(fileContext, costMode, tokensWithResponse, {
            agentStepId,
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
          }),
          fileContext,
          description,
          {
            skipRequestingFiles: false,
            agentStepId,
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
            costMode,
            repoId: repoName,
          }
        )
      logger.debug(
        {
          content: description,
          description: description,
          addedFilesPaths: addedFiles.map((f) => f.path),
          updatedFilePaths,
          printedPaths,
        },
        'find_files tool call'
      )
      addToolCallWithResponse(
        toolCall,
        addedFiles.length > 0
          ? addedFiles
          : `No new files found for description: ${description}`
      )
    } else if (toolCall.toolName === 'research') {
      const { prompts: promptsStr } = toolCall.args as { prompts: string }
      let prompts: string[]
      try {
        prompts = JSON.parse(promptsStr)
      } catch (e) {
        addToolCallWithResponse(toolCall, `Failed to parse prompts: ${e}`)
        continue
      }

      let formattedResult: string
      try {
        const researchResults = await research(ws, prompts, sessionState, {
          userId,
          clientSessionId,
          fingerprintId,
          promptId: userInputId,
        })
        formattedResult = researchResults
          .map(
            (result, i) =>
              `<research_result>\n<prompt>${prompts[i]}</prompt>\n<result>${result}</result>\n</research_result>`
          )
          .join('\n\n')

        logger.debug({ prompts, researchResults }, 'Ran research')
      } catch (e) {
        formattedResult = `Error running research, consider retrying?: ${e instanceof Error ? e.message : 'Unknown error'}`
      }

      addToolCallWithResponse(toolCall, formattedResult)
    } else {
      throw new Error(`Unknown tool: ${name}`)
    }
  }

  if (Object.keys(fileProcessingPromisesByPath).length > 0) {
    onResponseChunk('\n\nApplying file changes, please wait...\n')
  }

  // Flatten all promises while maintaining order within each file path
  const fileProcessingPromises = Object.values(
    fileProcessingPromisesByPath
  ).flat()

  const results = await Promise.all(fileProcessingPromises)
  const [fileChangeErrors, fileChanges] = partition(
    results,
    (result) => 'error' in result
  )

  for (const result of fileChangeErrors) {
    // Forward error message to agent as tool result.
    addToolCallWithResponse(result.toolCall, `${result.path}: ${result.error}`)
  }

  if (fileChanges.length === 0 && fileProcessingPromises.length > 0) {
    onResponseChunk('No changes to existing files.\n')
  }
  if (fileChanges.length > 0) {
    onResponseChunk(`\n`)
  }

  // Add successful changes to clientToolCalls
  const changeToolCalls: ClientToolCall[] = fileChanges.map(
    ({ path, content, patch, tool, toolCall }) => ({
      type: 'tool-call',
      toolName: tool,
      toolCallId: toolCall.toolCallId,
      args: patch
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
    })
  )
  clientToolCalls.unshift(...changeToolCalls)

  const newAgentContext = await agentContextPromise

  let finalMessageHistory = expireMessages(
    [...messagesWithEphemeralMessages, ...fullResponse],
    'agentStep'
  )

  // Handle /compact command: replace message history with the summary
  const wasCompacted =
    prompt &&
    (prompt.toLowerCase() === '/compact' || prompt.toLowerCase() === 'compact')
  if (wasCompacted) {
    finalMessageHistory = [
      {
        role: 'user',
        content: asSystemMessage(
          `The following is a summary of the conversation between you and the user. The conversation continues after this summary:\n\n${fullResponse}`
        ),
      },
    ]
    logger.debug({ summary: fullResponse }, 'Compacted messages')
  }

  const newSessionState: SessionState = {
    ...sessionState,
    mainAgentState: {
      ...sessionState.mainAgentState,
      messageHistory: finalMessageHistory,
      stepsRemaining: sessionState.mainAgentState.stepsRemaining - 1,
      agentContext: newAgentContext,
    },
  }

  logger.debug(
    {
      iteration: iterationNum,
      prompt,
      fullResponse,
      subgoalToolCalls,
      clientToolCalls,
      remainingToolCalls,
      agentContext: newAgentContext,
      messagesWithResponse,
      model,
      duration: Date.now() - startTime,
    },
    `Main prompt response ${iterationNum}`
  )
  return {
    sessionState: newSessionState,
    toolCalls: clientToolCalls,
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

async function getFileReadingUpdates(
  ws: WebSocket,
  messages: CoreMessage[],
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
    repoId: string | undefined
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
    repoId,
  } = options

  const toolResults = messages
    .filter(isToolResult)
    .flatMap((content) => parseToolResults(toContentString(content)))
  const previousFileList = toolResults
    .filter(({ toolName }) => toolName === 'read_files')
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
        costMode,
        repoId
      )) ??
      []

  // Only record training data if we requested files
  if (requestedFiles.length > 0 && COLLECT_FULL_FILE_CONTEXT) {
    uploadExpandedFileContextForTraining(
      ws,
      { messages, system },
      fileContext,
      prompt,
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
      repoId
    ).catch((error) => {
      logger.error(
        { error },
        'Error uploading expanded file context for training'
      )
    })
  }

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

async function uploadExpandedFileContextForTraining(
  ws: WebSocket,
  {
    messages,
    system,
  }: {
    messages: CoreMessage[]
    system: string | Array<TextBlockParam>
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode,
  repoId: string | undefined
) {
  const files = await requestRelevantFilesForTraining(
    { messages, system },
    fileContext,
    assistantPrompt,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
    repoId
  )

  const loadedFiles = await requestFiles(ws, files)

  // Upload a map of:
  // {file_path: {content, token_count}}
  // up to 50k tokens
  const filesToUpload: Record<string, { content: string; tokens: number }> = {}
  for (const file of files) {
    const content = loadedFiles[file]
    if (content === null || content === undefined) {
      continue
    }
    const tokens = countTokens(content)
    if (tokens > 50000) {
      break
    }
    filesToUpload[file] = { content, tokens }
  }

  const trace: GetExpandedFileContextForTrainingBlobTrace = {
    type: 'get-expanded-file-context-for-training-blobs',
    created_at: new Date(),
    id: crypto.randomUUID(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    payload: {
      files: filesToUpload,
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
    },
  }

  // Upload the files to bigquery
  await insertTrace(trace)
}
