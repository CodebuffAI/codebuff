import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import {
  AgentResponseTrace,
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { ClientAction } from '@codebuff/common/actions'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { getToolCallString, toolSchema } from '@codebuff/common/constants/tools'
import {
  SessionState,
  ToolResult,
  type AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { parseFileBlocks, ProjectFileContext } from '@codebuff/common/util/file'
import { toContentString } from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import {
  HIDDEN_FILE_READ_STATUS,
  Model,
  models,
  ONE_TIME_LABELS,
  type CostMode,
} from 'common/constants'
import { difference, partition, uniq } from 'lodash'
import { WebSocket } from 'ws'

import { CodebuffMessage } from '@codebuff/common/types/message'
import { CoreMessage } from 'ai'
import { checkTerminalCommand } from './check-terminal-command'
import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from './find-files/request-files-prompt'
import { processFileBlock } from './process-file-block'
import { processStrReplace } from './process-str-replace'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { research } from './research'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { agentTemplates } from './templates/agent-list'
import { getAgentPrompt } from './templates/strings'
import { getThinkingStream } from './thinking-stream'
import {
  ClientToolCall,
  CodebuffToolCall,
  parseRawToolCall,
  TOOL_LIST,
  ToolName,
  updateContextFromToolCalls,
} from './tools'
import { logger } from './util/logger'
import {
  asSystemInstruction,
  asSystemMessage,
  asUserMessage,
  coreMessagesWithSystem,
  expireMessages,
  getCoreMessagesSubset,
  isSystemInstruction,
} from './util/messages'
import {
  isToolResult,
  parseReadFilesResult,
  parseToolResults,
  renderReadFilesResult,
  renderToolResults,
} from './util/parse-tool-call-xml'
import {
  simplifyReadFileResults,
  simplifyReadFileToolResult,
} from './util/simplify-tool-results'
import { countTokens, countTokensJson } from './util/token-counter'
import { getRequestContext } from './websockets/request-context'
import {
  requestFiles,
  requestOptionalFile,
  requestToolCall,
} from './websockets/websocket-action'
import { processStreamWithTags } from './xml-stream-parser'

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
  toolResults: Array<ToolResult>
}> => {
  const {
    userId,
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
    promptId,
    toolResults,
  } = action
  const { fileContext, mainAgentState } = sessionState
  const { agentContext } = mainAgentState

  const startTime = Date.now()
  let messageHistory = sessionState.mainAgentState.messageHistory

  // Get the extracted repo ID from request context
  const requestContext = getRequestContext()
  const repoId = requestContext?.processedRepoId

  const agentType = (
    {
      ask: 'claude4_base',
      lite: 'gemini25flash_base',
      normal: 'claude4_base',
      max: 'claude4_base',
      experimental: 'gemini25pro_base',
    } satisfies Record<CostMode, AgentTemplateType>
  )[costMode]
  const agentTemplate = agentTemplates[agentType]
  const { model } = agentTemplate

  const getStream = getAgentStreamFromTemplate({
    clientSessionId,
    fingerprintId,
    userInputId: promptId,
    userId,
    template: agentTemplate,
  })

  // Generates a unique ID for each main prompt run (ie: a step of the agent loop)
  // This is used to link logs within a single agent loop
  const agentStepId = crypto.randomUUID()
  if (!readOnlyMode) {
    trackEvent(AnalyticsEvent.AGENT_STEP, userId ?? '', {
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId: promptId,
      userId,
      repoName: repoId,
    })
  }

  const isExporting =
    prompt &&
    (prompt.toLowerCase() === '/export' || prompt.toLowerCase() === 'export')

  const messagesWithToolResultsAndUser = buildArray<CodebuffMessage>(
    ...messageHistory,
    toolResults.length > 0 && {
      role: 'user' as const,
      content: renderToolResults(toolResults),
    },
    prompt && [
      {
        role: 'user' as const,
        content: asUserMessage(prompt),
      },
    ]
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
      const newSessionState = {
        ...sessionState,
        messageHistory: expireMessages(
          messagesWithToolResultsAndUser,
          'userPrompt'
        ),
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
        toolResults: [],
      }
    }
  }

  // Check number of assistant messages since last user message with prompt
  if (mainAgentState.stepsRemaining <= 0) {
    logger.warn(
      `Detected too many consecutive assistant messages without user prompt`
    )

    const warningString = [
      "I've made quite a few responses in a row.",
      "Let me pause here to make sure we're still on the right track.",
      "Please let me know if you'd like me to continue or if you'd like to guide me in a different direction.",
    ].join(' ')

    onResponseChunk(`${warningString}\n\n`)

    return {
      sessionState: {
        ...sessionState,
        mainAgentState: {
          ...mainAgentState,
          messageHistory: [
            ...expireMessages(messagesWithToolResultsAndUser, 'userPrompt'),
            {
              role: 'user',
              content: asSystemMessage(
                `The assistant has responded too many times in a row. The assistant's turn has automatically been ended. The number of responses can be changed in codebuff.json.`
              ),
            },
          ],
        },
      },
      toolCalls: [],
      toolResults: [],
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
      skipRequestingFiles: true,
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId: promptId,
      userId,
      costMode,
      repoId,
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
      if (toolResult.toolName === 'read_files') {
        toolResults[i] = simplifyReadFileToolResult(toolResult)
      }
    }

    messageHistory = messageHistory.filter((message) => {
      return (
        typeof message.content !== 'string' ||
        !isSystemInstruction(message.content)
      )
    })
  }

  if (printedPaths.length > 0) {
    const readFileToolCall = getToolCallString('read_files', {
      paths: printedPaths.join('\n'),
    })
    onResponseChunk(`${readFileToolCall}\n\n`)
  }

  if (updatedFiles.length > 0) {
    toolResults.push({
      toolName: 'file_updates',
      toolCallId: generateCompactId(),
      result:
        `These are the updates made to the files since the last response (either by you or by the user). These are the most recent versions of these files. You MUST be considerate of the user's changes:\n` +
        renderReadFilesResult(updatedFiles, fileContext.tokenCallers ?? {}),
    })
  }

  const readFileMessages: CodebuffMessage[] = []
  if (newFiles.length > 0) {
    const readFilesToolResult: ToolResult = {
      toolCallId: generateCompactId(),
      toolName: 'read_files',
      result: renderReadFilesResult(newFiles, fileContext.tokenCallers ?? {}),
    }

    readFileMessages.push(
      {
        role: 'user' as const,
        content: asSystemInstruction(
          `Before continuing with the user request, read the following files:\n${newFiles.map((file) => file.path).join('\n')}`
        ),
      },
      {
        role: 'assistant' as const,
        content: getToolCallString('read_files', {
          paths: newFiles.map((file) => file.path).join('\n'),
        }),
      },
      {
        role: 'user' as const,
        content: asSystemMessage(renderToolResults([readFilesToolResult])),
      }
    )
  }

  const messagesWithUserMessage = buildArray<CodebuffMessage>(
    ...expireMessages(messageHistory, prompt ? 'userPrompt' : 'agentStep'),

    toolResults.length > 0 && {
      role: 'user' as const,
      content: asSystemMessage(renderToolResults(toolResults)),
    },

    prompt && [
      {
        // Actual user prompt!
        role: 'user' as const,
        content: asUserMessage(prompt),
      },
      prompt in additionalSystemPrompts && {
        role: 'user' as const,
        content: asSystemInstruction(
          additionalSystemPrompts[
            prompt as keyof typeof additionalSystemPrompts
          ]
        ),
      },
    ],

    ...readFileMessages,

    prompt && {
      role: 'user',
      content: getAgentPrompt(
        agentType,
        'userInputPrompt',
        fileContext,
        mainAgentState
      ),
      timeToLive: 'userPrompt',
    },

    {
      role: 'user',
      content: getAgentPrompt(
        agentType,
        'agentStepPrompt',
        fileContext,
        mainAgentState
      ),
      timeToLive: 'agentStep',
    }
  )

  const iterationNum = messagesWithUserMessage.length

  const system = getAgentPrompt(
    agentType,
    'systemPrompt',
    fileContext,
    mainAgentState
  )
  const systemTokens = countTokensJson(system)

  // Possibly truncated messagesWithUserMessage + cache.
  const agentMessages = getCoreMessagesSubset(
    messagesWithUserMessage,
    systemTokens
  )

  const debugPromptCaching = false
  if (debugPromptCaching) {
    // Store the agent request to a file for debugging
    await saveAgentRequest(
      coreMessagesWithSystem(agentMessages, system),
      promptId
    )
  }

  logger.debug(
    {
      agentMessages,
      prompt,
      agentContext,
      iteration: iterationNum,
      toolResults,
      systemTokens,
      model,
      duration: Date.now() - startTime,
    },
    `Main prompt ${iterationNum}`
  )

  let fullResponse = ''
  const fileProcessingPromisesByPath: Record<
    string,
    Promise<
      {
        tool: 'write_file' | 'str_replace' | 'create_plan'
        path: string
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

  // vvv TEMPORARY FOR PRE-AGENT SPAWNING vvv
  // Think deeply at the start of every response
  if (costMode === 'max') {
    let response = await getThinkingStream(
      coreMessagesWithSystem(agentMessages, system),
      (chunk) => {
        onResponseChunk(chunk)
      },
      {
        costMode,
        clientSessionId,
        fingerprintId,
        userInputId: promptId,
        userId,
        model: modelConfig?.reasoningModel,
      }
    )
    if (model === models.gpt4_1) {
      onResponseChunk('\n')
      response += '\n'
    }
    fullResponse += response
  }
  // ^^^ TEMPORARY FOR PRE-AGENT SPAWNING ^^^

  const stream = getStream(
    coreMessagesWithSystem(
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
  )

  const allToolCalls: CodebuffToolCall[] = []
  const clientToolCalls: ClientToolCall[] = []
  const serverToolResults: ToolResult[] = []
  const subgoalToolCalls: Extract<
    CodebuffToolCall,
    { toolName: 'add_subgoal' | 'update_subgoal' }
  >[] = []

  let foundParsingError = false

  function toolCallback<T extends ToolName>(
    tool: T,
    after: (toolCall: Extract<CodebuffToolCall, { toolName: T }>) => void
  ): {
    params: (string | RegExp)[]
    onTagStart: () => void
    onTagEnd: (
      name: string,
      parameters: Record<string, string>
    ) => Promise<void>
  } {
    return {
      params: toolSchema[tool],
      onTagStart: () => {},
      onTagEnd: async (_: string, args: Record<string, string>) => {
        const toolCall = parseRawToolCall({
          type: 'tool-call',
          toolName: tool,
          toolCallId: generateCompactId(),
          args,
        })
        if ('error' in toolCall) {
          serverToolResults.push({
            toolName: tool,
            toolCallId: generateCompactId(),
            result: toolCall.error,
          })
          foundParsingError = true
          return
        }

        // Filter out restricted tools in ask mode unless exporting summary
        if (
          (costMode === 'ask' || readOnlyMode) &&
          !isExporting &&
          buildArray<ToolName>(
            'write_file',
            'str_replace',
            'run_terminal_command',
            readOnlyMode && 'create_plan'
          ).includes(tool)
        ) {
          serverToolResults.push({
            toolName: tool,
            toolCallId: generateCompactId(),
            result: `Tool ${tool} is not available in ${readOnlyMode ? 'read-only' : 'ask'} mode. You can only use tools that read information or provide analysis.`,
          })
          return
        }

        allToolCalls.push(toolCall as Extract<CodebuffToolCall, { name: T }>)

        after(toolCall as Extract<CodebuffToolCall, { name: T }>)
      },
    }
  }
  const streamWithTags = processStreamWithTags(
    stream,
    {
      ...Object.fromEntries(
        TOOL_LIST.map((tool) => [tool, toolCallback(tool, () => {})])
      ),
      think_deeply: toolCallback('think_deeply', (toolCall) => {
        const { thought } = toolCall.args
        logger.debug(
          {
            thought,
          },
          'Thought deeply'
        )
      }),
      ...Object.fromEntries(
        (['add_subgoal', 'update_subgoal'] as const).map((tool) => [
          tool,
          toolCallback(tool, (toolCall) => {
            subgoalToolCalls.push(toolCall)
          }),
        ])
      ),
      ...Object.fromEntries(
        (['code_search', 'browser_logs', 'end_turn'] as const).map((tool) => [
          tool,
          toolCallback(tool, (toolCall) => {
            clientToolCalls.push({
              ...toolCall,
              toolCallId: generateCompactId(),
            } as ClientToolCall)
          }),
        ])
      ),
      run_terminal_command: toolCallback('run_terminal_command', (toolCall) => {
        const clientToolCall = {
          ...{
            ...toolCall,
            args: {
              ...toolCall.args,
              mode: 'assistant' as const,
            },
          },
          toolCallId: generateCompactId(),
        }
        clientToolCalls.push(clientToolCall)
      }),
      create_plan: toolCallback('create_plan', (toolCall) => {
        const { path, plan } = toolCall.args
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
          if (path.endsWith('knowledge.md')) {
            trackEvent(AnalyticsEvent.KNOWLEDGE_FILE_UPDATED, userId ?? '', {
              agentStepId,
              clientSessionId,
              fingerprintId,
              userInputId: promptId,
              userId,
              repoName: repoId,
            })
          }
        }
        const change = {
          tool: 'create_plan' as const,
          path,
          content: plan,
        }
        fileProcessingPromisesByPath[path].push(Promise.resolve(change))
      }),
      write_file: toolCallback('write_file', (toolCall) => {
        const { path, instructions, content } = toolCall.args
        if (!content) return

        // Initialize state for this file path if needed
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

        const fileContentWithoutStartNewline = content.startsWith('\n')
          ? content.slice(1)
          : content

        logger.debug({ path, content }, `write_file ${path}`)

        const newPromise = processFileBlock(
          path,
          instructions,
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
          logger.error(error, 'Error processing write_file block')
          return {
            tool: 'write_file' as const,
            path,
            error: `Error: Failed to process the write_file block. ${typeof error === 'string' ? error : error.msg}`,
          }
        })

        fileProcessingPromisesByPath[path].push(newPromise)

        return
      }),
      str_replace: toolCallback('str_replace', (toolCall) => {
        const { path, old_vals, new_vals } = toolCall.args
        if (!old_vals || !Array.isArray(old_vals)) {
          return
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

        const newPromise = processStrReplace(
          path,
          old_vals,
          new_vals || [],
          latestContentPromise
        ).catch((error: any) => {
          logger.error(error, 'Error processing str_replace block')
          return {
            tool: 'str_replace' as const,
            path,
            error: 'Unknown error: Failed to process the str_replace block.',
          }
        })

        fileProcessingPromisesByPath[path].push(newPromise)

        return
      }),
    },
    (toolName, error) => {
      foundParsingError = true
      serverToolResults.push({
        toolName,
        toolCallId: generateCompactId(),
        result: error,
      })
    }
  )

  for await (const chunk of streamWithTags) {
    const trimmed = chunk.trim()
    if (
      !ONE_TIME_LABELS.some(
        (tag) => trimmed.startsWith(`<${tag}>`) && trimmed.endsWith(`</${tag}>`)
      )
    ) {
      fullResponse += chunk
    }
    onResponseChunk(chunk)
  }

  const agentResponseTrace: AgentResponseTrace = {
    type: 'agent-response',
    created_at: new Date(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    id: crypto.randomUUID(),
    payload: {
      output: fullResponse,
      user_input_id: promptId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
    },
  }

  insertTrace(agentResponseTrace)

  const messagesWithResponse = [
    ...agentMessages,
    {
      role: 'assistant' as const,
      content: fullResponse,
    },
  ]

  const agentContextPromise =
    subgoalToolCalls.length > 0
      ? updateContextFromToolCalls(agentContext, subgoalToolCalls)
      : Promise.resolve(agentContext)

  for (const toolCall of allToolCalls) {
    const { toolName: name, args: parameters } = toolCall
    trackEvent(AnalyticsEvent.TOOL_USE, userId ?? '', {
      tool: name,
      parameters,
    })
    if (
      toolCall.toolName === 'write_file' ||
      toolCall.toolName === 'str_replace' ||
      toolCall.toolName === 'add_subgoal' ||
      toolCall.toolName === 'update_subgoal' ||
      toolCall.toolName === 'code_search' ||
      toolCall.toolName === 'run_terminal_command' ||
      toolCall.toolName === 'browser_logs' ||
      toolCall.toolName === 'think_deeply' ||
      toolCall.toolName === 'create_plan' ||
      toolCall.toolName === 'end_turn'
    ) {
      // Handled above
    } else if (toolCall.toolName === 'read_files') {
      const paths = (
        toolCall as Extract<CodebuffToolCall, { toolName: 'read_files' }>
      ).args.paths
        .split(/\s+/)
        .map((path: string) => path.trim())
        .filter(Boolean)

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
          skipRequestingFiles: true,
          requestedFiles: paths,
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId: promptId,
          userId,
          costMode,
          repoId,
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
      serverToolResults.push({
        toolName: 'read_files',
        toolCallId: generateCompactId(),
        result: renderReadFilesResult(
          addedFiles,
          fileContext.tokenCallers ?? {}
        ),
      })
    } else if (toolCall.toolName === 'find_files') {
      const description = (
        toolCall as Extract<CodebuffToolCall, { toolName: 'find_files' }>
      ).args.description
      const { addedFiles, updatedFilePaths, printedPaths } =
        await getFileReadingUpdates(
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
          description,
          {
            skipRequestingFiles: false,
            agentStepId,
            clientSessionId,
            fingerprintId,
            userInputId: promptId,
            userId,
            costMode,
            repoId,
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
      serverToolResults.push({
        toolName: 'find_files',
        toolCallId: generateCompactId(),
        result:
          addedFiles.length > 0
            ? renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {})
            : `No new files found for description: ${description}`,
      })
      if (printedPaths.length > 0) {
        onResponseChunk('\n\n')
        onResponseChunk(
          getToolCallString('read_files', {
            paths: printedPaths.join('\n'),
          })
        )
      }
    } else if (toolCall.toolName === 'research') {
      const { prompts: promptsStr } = toolCall.args as { prompts: string }
      let prompts: string[]
      try {
        prompts = JSON.parse(promptsStr)
      } catch (e) {
        serverToolResults.push({
          toolName: 'research',
          toolCallId: generateCompactId(),
          result: `Failed to parse prompts: ${e}`,
        })
        continue
      }

      let formattedResult: string
      try {
        const researchResults = await research(ws, prompts, sessionState, {
          userId,
          clientSessionId,
          fingerprintId,
          promptId,
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

      serverToolResults.push({
        toolName: 'research',
        toolCallId: generateCompactId(),
        result: formattedResult,
      })
    } else if (toolCall.toolName === 'spawn_agents') {
      const { agents } = toolCall.args
      for (const { agent_type: agentType, prompt } of agents) {
        // TODO also check if current agent is able to spawn this agent
        if (!(agentType in agentTemplates)) {
          serverToolResults.push({
            toolName: 'spawn_agents',
            toolCallId: toolCall.toolCallId,
            result: `Agent type ${agentType} not found.`,
          })
          continue
        }

        const agentTemplate =
          agentTemplates[agentType as keyof typeof agentTemplates]
        // TODO: call appropriate agent
      }
    } else {
      toolCall satisfies never
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
    serverToolResults.push({
      toolName: result.tool,
      toolCallId: generateCompactId(),
      result: `${result.path}: ${result.error}`,
    })
  }

  if (fileChanges.length === 0 && fileProcessingPromises.length > 0) {
    onResponseChunk('No changes to existing files.\n')
  }
  if (fileChanges.length > 0) {
    onResponseChunk(`\n`)
  }

  // Add successful changes to clientToolCalls
  const changeToolCalls: ClientToolCall[] = fileChanges.map(
    ({ path, content, patch, tool }) => ({
      type: 'tool-call',
      toolName: tool,
      toolCallId: generateCompactId(),
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

  let finalMessageHistory = expireMessages(messagesWithResponse, 'agentStep')

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
      ...mainAgentState,
      messageHistory: finalMessageHistory,
      stepsRemaining: mainAgentState.stepsRemaining - 1,
      agentContext: newAgentContext,
    },
  }

  for (const clientToolCall of clientToolCalls) {
    const result = await requestToolCall(
      ws,
      clientToolCall.toolName,
      clientToolCall.args
    )
    if (!result.success) {
      logger.error({ error: result.error }, 'Error executing tool call')
      serverToolResults.push({
        toolName: clientToolCall.toolName,
        toolCallId: clientToolCall.toolCallId,
        result: result.error ?? 'Unknown error',
      })
    } else {
      serverToolResults.push({
        toolName: clientToolCall.toolName,
        toolCallId: clientToolCall.toolCallId,
        result: result.result,
      })
    }
  }
  const maybeEndTurn = clientToolCalls.filter(
    (toolCall) => toolCall.toolName === 'end_turn'
  )

  logger.debug(
    {
      iteration: iterationNum,
      prompt,
      fullResponse,
      toolCalls: allToolCalls,
      clientToolCalls,
      serverToolResults,
      agentContext: newAgentContext,
      messagesWithResponse,
      model,
      duration: Date.now() - startTime,
    },
    `Main prompt response ${iterationNum}`
  )
  return {
    sessionState: newSessionState,
    toolCalls: maybeEndTurn,
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
