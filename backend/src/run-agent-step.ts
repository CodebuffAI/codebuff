import {
  AgentResponseTrace,
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { trackEvent } from '@codebuff/common/analytics'
import {
  HIDDEN_FILE_READ_STATUS,
  ONE_TIME_LABELS,
} from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  getToolCallString,
  renderToolResults,
  ToolName,
  toolNames,
} from '@codebuff/common/constants/tools'
import { CodebuffMessage } from '@codebuff/common/types/message'
import {
  AgentState,
  ToolResult,
  type AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { parseFileBlocks, ProjectFileContext } from '@codebuff/common/util/file'
import { toContentString } from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import { closeXml } from '@codebuff/common/util/xml'
import { CoreMessage } from 'ai'
import { difference, partition, uniq } from 'lodash'
import { WebSocket } from 'ws'
import { requestRelevantFilesForTraining } from './find-files/request-files-prompt'
import { checkLiveUserInput } from './live-user-inputs'
import { TextBlock } from './llm-apis/claude'
import { processFileBlock } from './process-file-block'
import { processStrReplace } from './process-str-replace'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { runTool } from './run-tool'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { agentTemplates } from './templates/agent-list'
import { formatPrompt, getAgentPrompt } from './templates/strings'
import {
  ClientToolCall,
  parseRawToolCall,
  toolParams,
  updateContextFromToolCalls,
} from './tools'
import { CodebuffToolCall } from './tools/constants'
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
} from './util/parse-tool-call-xml'
import { simplifyReadFileResults } from './util/simplify-tool-results'
import { countTokens, countTokensJson } from './util/token-counter'
import { getRequestContext } from './websockets/request-context'
import {
  requestFiles,
  requestOptionalFile,
  requestToolCall,
} from './websockets/websocket-action'
import { processStreamWithTags } from './xml-stream-parser'

export interface AgentOptions {
  userId: string | undefined
  userInputId: string
  clientSessionId: string
  fingerprintId: string
  onResponseChunk: (chunk: string) => void

  agentType: AgentTemplateType
  fileContext: ProjectFileContext
  agentState: AgentState

  prompt: string | undefined
  params: Record<string, any> | undefined
  assistantMessage: string | undefined
  assistantPrefix: string | undefined
}

export const runAgentStep = async (
  ws: WebSocket,
  options: AgentOptions
): Promise<{
  agentState: AgentState
  fullResponse: string
  shouldEndTurn: boolean
}> => {
  const {
    userId,
    userInputId,
    fingerprintId,
    clientSessionId,
    onResponseChunk,
    fileContext,
    agentType,
    agentState,
    prompt,
    params,
    assistantMessage,
    assistantPrefix,
  } = options

  const { agentContext } = agentState

  const startTime = Date.now()
  let messageHistory = agentState.messageHistory

  // Get the extracted repo ID from request context
  const requestContext = getRequestContext()
  const repoId = requestContext?.processedRepoId

  const agentTemplate = agentTemplates[agentType]
  if (!agentTemplate) {
    throw new Error(
      `Agent template not found for type: ${agentType}. Available types: ${Object.keys(agentTemplates).join(', ')}`
    )
  }
  const { model } = agentTemplate

  const getStream = getAgentStreamFromTemplate({
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    template: agentTemplate,
  })

  // Generates a unique ID for each main prompt run (ie: a step of the agent loop)
  // This is used to link logs within a single agent loop
  const agentStepId = crypto.randomUUID()
  trackEvent(AnalyticsEvent.AGENT_STEP, userId ?? '', {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoName: repoId,
  })

  const messagesWithUserPrompt = buildArray<CodebuffMessage>(
    ...messageHistory,
    prompt && [
      {
        role: 'user' as const,
        content: asUserMessage(prompt),
      },
    ]
  )

  // Check number of assistant messages since last user message with prompt
  if (agentState.stepsRemaining <= 0) {
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
      agentState: {
        ...agentState,
        messageHistory: [
          ...expireMessages(messagesWithUserPrompt, 'userPrompt'),
          {
            role: 'user',
            content: asSystemMessage(
              `The assistant has responded too many times in a row. The assistant's turn has automatically been ended. The number of responses can be changed in codebuff.json.`
            ),
          },
        ],
      },
      fullResponse: warningString,
      shouldEndTurn: true,
    }
  }

  const { addedFiles, updatedFilePaths, clearReadFileToolResults } =
    await getFileReadingUpdates(ws, messagesWithUserPrompt, fileContext, {
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repoId,
    })
  if (clearReadFileToolResults) {
    // Update message history.
    for (const message of messageHistory) {
      if (isToolResult(message)) {
        message.content = simplifyReadFileResults(message.content)
      }
    }

    messageHistory = messageHistory.filter((message) => {
      return (
        typeof message.content !== 'string' ||
        !isSystemInstruction(message.content)
      )
    })
  }

  const toolResults = []

  const updatedFiles = addedFiles.filter((f) =>
    updatedFilePaths.includes(f.path)
  )

  if (updatedFiles.length > 0) {
    toolResults.push({
      toolName: 'file_updates',
      toolCallId: generateCompactId(),
      result:
        `These are the updates made to the files since the last response (either by you or by the user). These are the most recent versions of these files. You MUST be considerate of the user's changes:\n` +
        renderReadFilesResult(updatedFiles, fileContext.tokenCallers ?? {}),
    })
  }

  const hasPrompt = Boolean(prompt || params)

  const agentStepPrompt = getAgentPrompt(
    agentType,
    'agentStepPrompt',
    fileContext,
    agentState
  )

  const agentMessagesUntruncated = buildArray<CodebuffMessage>(
    ...expireMessages(messageHistory, prompt ? 'userPrompt' : 'agentStep'),

    toolResults.length > 0 && {
      role: 'user' as const,
      content: asSystemMessage(renderToolResults(toolResults)),
    },

    hasPrompt && [
      {
        // Actual user prompt!
        role: 'user' as const,
        content: asUserMessage(
          `${prompt ?? ''}${params ? `\n\n${JSON.stringify(params, null, 2)}` : ''}`
        ),
      },
      prompt &&
        prompt in additionalSystemPrompts && {
          role: 'user' as const,
          content: asSystemInstruction(
            additionalSystemPrompts[
              prompt as keyof typeof additionalSystemPrompts
            ]
          ),
        },
    ],

    hasPrompt && {
      role: 'user',
      content: getAgentPrompt(
        agentType,
        'userInputPrompt',
        fileContext,
        agentState
      ),
      timeToLive: 'userPrompt',
    },

    agentStepPrompt && {
      role: 'user',
      content: agentStepPrompt,
      timeToLive: 'agentStep',
    },

    assistantPrefix?.trim() && {
      role: 'assistant' as const,
      content: assistantPrefix.trim(),
    }
  )

  const iterationNum = agentMessagesUntruncated.length

  const system = getAgentPrompt(
    agentType,
    'systemPrompt',
    fileContext,
    agentState
  )
  const systemTokens = countTokensJson(system)

  // Possibly truncated messagesWithUserMessage + cache.
  const agentMessages = getCoreMessagesSubset(
    agentMessagesUntruncated,
    systemTokens
  )

  const debugPromptCaching = false
  if (debugPromptCaching) {
    // Store the agent request to a file for debugging
    await saveAgentRequest(
      coreMessagesWithSystem(agentMessages, system),
      userInputId
    )
  }

  logger.debug(
    {
      agentMessages,
      system,
      prompt,
      params,
      agentContext,
      iteration: iterationNum,
      toolResults,
      systemTokens,
      model,
      duration: Date.now() - startTime,
    },
    `Agent ${agentType} step ${iterationNum} (${userInputId} - Prompt: ${(prompt ?? 'undefined').slice(0, 20)}) start`
  )

  let fullResponse = `${assistantPrefix?.trim() ?? ''}`
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
            messages: string[]
          }
        | {
            error: string
          }
      )
    >[]
  > = {}

  const stream = assistantMessage
    ? (async function* () {
        yield assistantMessage.trim()
      })()
    : getStream(
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
    params: string[]
    onTagStart: () => void
    onTagEnd: (
      name: string,
      parameters: Record<string, string>
    ) => Promise<void>
  } {
    return {
      params: toolParams[tool],
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
        if (!agentTemplate.toolNames.includes(toolCall.toolName)) {
          serverToolResults.push({
            toolName: tool,
            toolCallId: generateCompactId(),
            result: `Tool \`${tool}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
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
        toolNames.map((tool) => [tool, toolCallback(tool, () => {})])
      ),
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
              userInputId,
              userId,
              repoName: repoId,
            })
          }
        }
        const change = {
          tool: 'create_plan' as const,
          path,
          content: plan,
          messages: [],
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
          agentMessagesUntruncated,
          fullResponse,
          prompt,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId
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
        const { path, replacements } = toolCall.args

        if (!fileProcessingPromisesByPath[path]) {
          fileProcessingPromisesByPath[path] = []
        }

        const latestContentPromise = Promise.all(
          fileProcessingPromisesByPath[path]
        ).then((results) => {
          const previousEdit = results.findLast((r) => 'content' in r)
          return previousEdit
            ? previousEdit.content
            : requestOptionalFile(ws, path)
        })

        const newPromise = processStrReplace(
          path,
          replacements,
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
        (tag) =>
          trimmed.startsWith(`<${tag}>`) && trimmed.endsWith(closeXml(tag))
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
      user_input_id: userInputId,
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
      toolCall.toolName === 'create_plan'
    ) {
      // These are handled above in the streaming section
      continue
    } else if (toolCall.toolName === 'spawn_agents') {
      // Spawn agents are handled at the bottom of this function
      continue
    } else if (
      toolCall.toolName === 'add_subgoal' ||
      toolCall.toolName === 'update_subgoal'
    ) {
      // Handle subgoal tools
      subgoalToolCalls.push(
        toolCall as Extract<
          CodebuffToolCall,
          { toolName: 'add_subgoal' | 'update_subgoal' }
        >
      )
      continue
    }

    // Use the new runTool function for other tools
    try {
      const toolResult = await runTool(toolCall, {
        ws,
        userId,
        userInputId,
        clientSessionId,
        fingerprintId,
        agentStepId,
        fileContext,
        messages: messagesWithResponse,
        agentTemplate,
        repoId,
        agentState,
      })

      if (toolResult.type === 'server_result') {
        serverToolResults.push(toolResult.result)
      } else if (toolResult.type === 'client_call') {
        clientToolCalls.push(toolResult.call)
      } else if (toolResult.type === 'state_update') {
        serverToolResults.push(toolResult.result)
        Object.assign(agentState, toolResult.updatedAgentState)
      }
    } catch (error) {
      logger.error(
        {
          toolCall,
          error: error instanceof Error ? error.message : error,
        },
        'Error executing tool call'
      )
      serverToolResults.push({
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        result: `Error executing ${toolCall.toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
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

  // If there were file changes, automatically run file change hooks once at the end
  if (fileChanges.length > 0) {
    const changedFilePaths = fileChanges.map(({ path }) => path)
    clientToolCalls.push({
      toolName: 'run_file_change_hooks',
      toolCallId: generateCompactId(),
      args: {
        files: changedFilePaths,
      },
    })
  }

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

  for (const clientToolCall of clientToolCalls) {
    if (!checkLiveUserInput(userId, userInputId)) {
      return { agentState, fullResponse: '', shouldEndTurn: true }
    }
    const result = await requestToolCall(
      ws,
      userInputId,
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

  // Handle spawn_agents tool call
  const spawnAgentsToolCall = allToolCalls.find(
    (call) => call.toolName === 'spawn_agents'
  ) as undefined | (ClientToolCall & { toolName: 'spawn_agents' })
  if (spawnAgentsToolCall) {
    try {
      const messages = [
        ...finalMessageHistory,
        {
          role: 'user' as const,
          content: asSystemMessage(renderToolResults(serverToolResults)),
        },
      ]

      const toolResult = await runTool(spawnAgentsToolCall, {
        ws,
        userId,
        userInputId,
        clientSessionId,
        fingerprintId,
        agentStepId,
        fileContext,
        messages,
        repoId,
        agentTemplate,
        agentState,
      })

      if (toolResult.type === 'server_result') {
        serverToolResults.push(toolResult.result)
      }
    } catch (error) {
      logger.error(
        {
          toolCall: spawnAgentsToolCall,
          error: error instanceof Error ? error.message : error,
        },
        'Error executing spawn_agents tool call'
      )
      serverToolResults.push({
        toolName: 'spawn_agents',
        toolCallId: spawnAgentsToolCall.toolCallId,
        result: `Error executing spawn_agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  finalMessageHistory.push({
    role: 'user',
    content: asSystemMessage(renderToolResults(serverToolResults)),
  })

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
    `Agent ${agentType} step ${iterationNum} (${userInputId} - Prompt: ${(prompt ?? 'undefined').slice(0, 20)}) end`
  )
  return {
    agentState: {
      ...agentState,
      messageHistory: finalMessageHistory,
      stepsRemaining: agentState.stepsRemaining - 1,
      agentContext: newAgentContext,
    },
    fullResponse,
    shouldEndTurn:
      clientToolCalls.some((call) => call.toolName === 'end_turn') ||
      (clientToolCalls.length === 0 && serverToolResults.length === 0),
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
  fileContext: ProjectFileContext,
  options: {
    requestedFiles?: string[]
    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    repoId: string | undefined
  }
) {
  const FILE_TOKEN_BUDGET = 100_000

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

  const requestedFiles = options.requestedFiles ?? []

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
    system: string | Array<TextBlock>
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
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

export const loopAgentSteps = async (
  ws: WebSocket,
  options: {
    userInputId: string
    agentType: AgentTemplateType
    agentState: AgentState
    prompt: string | undefined
    params: Record<string, any> | undefined
    fingerprintId: string
    fileContext: ProjectFileContext
    toolResults: ToolResult[]

    userId: string | undefined
    clientSessionId: string
    onResponseChunk: (chunk: string) => void
  }
) => {
  const {
    agentState,
    prompt,
    params,
    userId,
    clientSessionId,
    onResponseChunk,
    userInputId,
    fingerprintId,
    fileContext,
    agentType,
  } = options
  const agentTemplate = agentTemplates[agentType]
  const {
    initialAssistantMessage,
    initialAssistantPrefix,
    stepAssistantMessage,
    stepAssistantPrefix,
  } = agentTemplate
  let isFirstStep = true
  let currentPrompt = prompt
  let currentParams = params
  let currentAssistantMessage = initialAssistantMessage
  // NOTE: If the assistant message is set, we run one step with it, and then the next step will use the assistant prefix.
  let currentAssistantPrefix = initialAssistantMessage
    ? undefined
    : initialAssistantPrefix
  let currentAgentState = agentState
  while (checkLiveUserInput(userId, userInputId)) {
    const {
      agentState: newAgentState,
      fullResponse,
      shouldEndTurn,
    } = await runAgentStep(ws, {
      userId,
      userInputId,
      clientSessionId,
      fingerprintId,
      onResponseChunk,

      agentType,
      fileContext,
      agentState: currentAgentState,
      prompt: currentPrompt,
      params: currentParams,
      // TODO: format the prompt in runAgentStep
      assistantMessage: currentAssistantMessage
        ? formatPrompt(
            currentAssistantMessage,
            fileContext,
            currentAgentState,
            agentTemplate.toolNames,
            agentTemplate.spawnableAgents,
            prompt ?? ''
          )
        : '',
      assistantPrefix: currentAssistantPrefix
        ? formatPrompt(
            currentAssistantPrefix,
            fileContext,
            currentAgentState,
            agentTemplate.toolNames,
            agentTemplate.spawnableAgents,
            prompt ?? ''
          )
        : '',
    })

    if (shouldEndTurn) {
      const hasEndTurn = fullResponse.includes(
        getToolCallString('end_turn', {})
      )
      return {
        agentState: newAgentState,
        hasEndTurn,
      }
    }

    currentPrompt = undefined
    currentParams = undefined
    // Toggle assistant message between the injected step message and nothing.
    currentAssistantMessage = currentAssistantMessage
      ? ''
      : stepAssistantMessage

    // Only set the assistant prefix when no assistant message is injected.
    if (!currentAssistantMessage) {
      if (isFirstStep) {
        currentAssistantPrefix = initialAssistantPrefix
      } else {
        currentAssistantPrefix = stepAssistantPrefix
      }
    }

    currentAgentState = newAgentState
    isFirstStep = false
  }

  return { agentState }
}
