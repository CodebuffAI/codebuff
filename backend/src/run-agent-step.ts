import { AgentResponseTrace, insertTrace } from '@codebuff/bigquery'
import { trackEvent } from '@codebuff/common/analytics'
import { ONE_TIME_LABELS } from '@codebuff/common/constants'
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
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { closeXml } from '@codebuff/common/util/xml'
import { partition } from 'lodash'
import { WebSocket } from 'ws'
import { getFileReadingUpdates } from './get-file-reading-updates'
import { checkLiveUserInput } from './live-user-inputs'
import { processFileBlock } from './process-file-block'
import { processStrReplace } from './process-str-replace'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { runToolInner } from './run-tool'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { agentTemplates } from './templates/agent-list'
import { processAgentOverrides } from './templates/agent-overrides'
import { formatPrompt, getAgentPrompt } from './templates/strings'
import { AgentTemplateUnion } from './templates/types'
import {
  ProgrammaticAgentTemplate,
  AgentTemplate as LLMAgentTemplate,
} from './templates/types'
import { runProgrammaticAgent } from './run-programmatic-agent'
import {
  parseRawToolCall,
  ToolCallError,
  toolParams,
  updateContextFromToolCalls,
} from './tools'
import { ClientToolCall, CodebuffToolCall } from './tools/constants'
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
import { isToolResult, renderReadFilesResult } from './util/parse-tool-call-xml'
import { simplifyReadFileResults } from './util/simplify-tool-results'
import { countTokensJson } from './util/token-counter'
import { getRequestContext } from './websockets/request-context'
import {
  requestOptionalFile,
  requestToolCall,
} from './websockets/websocket-action'
import { processStreamWithTags } from './xml-stream-parser'
import { agentRegistry } from './templates/agent-registry'

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

/**
 * Helper function to get agent template with overrides applied
 */
async function getAgentTemplateWithOverrides(
  agentType: AgentTemplateType,
  fileContext: ProjectFileContext
): Promise<AgentTemplateUnion> {
  // Initialize registry if needed
  await agentRegistry.initialize(fileContext)

  const baseTemplate = agentRegistry.getTemplate(agentType)
  if (!baseTemplate) {
    const availableTypes = agentRegistry.getAvailableTypes()
    throw new Error(
      `Agent template not found for type: ${agentType}. Available types: ${availableTypes.join(', ')}`
    )
  }

  if (baseTemplate.implementation === 'programmatic') {
    // Programmatic agents cannot be overridden.
    return baseTemplate
  }

  return processAgentOverrides(baseTemplate, fileContext)
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

  const agentTemplate = await getAgentTemplateWithOverrides(
    agentType,
    fileContext
  )
  if (!agentTemplate) {
    throw new Error(
      `Agent template not found for type: ${agentType}. Available types: ${Object.keys(agentTemplates).join(', ')}`
    )
  }

  if (agentTemplate.implementation === 'programmatic') {
    const agentState = await runProgrammaticAgent(
      agentTemplate as unknown as ProgrammaticAgentTemplate,
      { ...options, ws }
    )
    return {
      agentState,
      shouldEndTurn: true,
      fullResponse: '',
    }
  }

  const { model } = agentTemplate

  const getStream = getAgentStreamFromTemplate({
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    template: agentTemplate as LLMAgentTemplate,
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

  const agentStepPrompt = await getAgentPrompt(
    agentTemplate,
    { type: 'agentStepPrompt' },
    fileContext,
    agentState
  )

  // Extract user input prompt to match hasPrompt && {...} pattern
  const userInputPrompt = hasPrompt
    ? await getAgentPrompt(
        agentTemplate,
        { type: 'userInputPrompt' },
        fileContext,
        agentState
      )
    : undefined

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

    userInputPrompt && {
      role: 'user' as const,
      content: userInputPrompt,
      timeToLive: 'userPrompt' as const,
    },

    agentStepPrompt && {
      role: 'user' as const,
      content: agentStepPrompt,
      timeToLive: 'agentStep' as const,
    },

    assistantPrefix?.trim() && {
      role: 'assistant' as const,
      content: assistantPrefix.trim(),
    }
  )

  const iterationNum = agentMessagesUntruncated.length

  const system = await getAgentPrompt(
    agentTemplate,
    { type: 'systemPrompt' },
    fileContext,
    agentState
  )
  if (!system) {
    throw new Error(`System prompt is required for agent type: ${agentType}`)
  }
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
      agentTemplate,
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

  // Create a simple async generator for assistant message
  async function* createAssistantMessageStream(message: string) {
    yield message.trim()
  }

  const stream = assistantMessage
    ? createAssistantMessageStream(assistantMessage)
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
  const subgoalToolCalls: CodebuffToolCall<'add_subgoal' | 'update_subgoal'>[] =
    []

  let foundParsingError = false

  function toolCallback<T extends ToolName>(
    tool: T,
    after: (toolCall: CodebuffToolCall<T>) => void
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
        const toolCall: CodebuffToolCall<T> | ToolCallError =
          parseRawToolCall<T>({
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

        allToolCalls.push(toolCall)

        after(toolCall)
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
      const toolResult = await runToolInner(toolCall, {
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
        // Update the current agentState with the new state
        agentState.report = toolResult.updatedAgentState.report
        agentState.agentContext = toolResult.updatedAgentState.agentContext
        agentState.subagents = toolResult.updatedAgentState.subagents
        agentState.messageHistory = toolResult.updatedAgentState.messageHistory
        agentState.stepsRemaining = toolResult.updatedAgentState.stepsRemaining
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

      const toolResult = await runToolInner(spawnAgentsToolCall, {
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
      agentTemplate,
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
  const agentTemplate = await getAgentTemplateWithOverrides(
    agentType,
    fileContext
  )
  const {
    initialAssistantMessage,
    initialAssistantPrefix,
    stepAssistantMessage,
    stepAssistantPrefix,
  } =
    agentTemplate.implementation === 'llm'
      ? agentTemplate
      : {
          initialAssistantMessage: undefined,
          initialAssistantPrefix: undefined,
          stepAssistantMessage: undefined,
          stepAssistantPrefix: undefined,
        }
  let isFirstStep = true
  let currentPrompt = prompt
  let currentParams = params
  let currentAssistantMessage: string | undefined = initialAssistantMessage
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
        ? await formatPrompt(
            currentAssistantMessage,
            fileContext,
            currentAgentState,
            agentTemplate.toolNames,
            agentTemplate.spawnableAgents,
            prompt ?? ''
          )
        : undefined,
      assistantPrefix:
        currentAssistantPrefix &&
        (await formatPrompt(
          currentAssistantPrefix,
          fileContext,
          currentAgentState,
          agentTemplate.toolNames,
          agentTemplate.spawnableAgents,
          prompt ?? ''
        )),
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

    // Only set the assistant prefix when no assistant message is injected.
    if (!currentAssistantMessage || !stepAssistantMessage) {
      currentAssistantPrefix = isFirstStep
        ? initialAssistantPrefix
        : stepAssistantPrefix
    }

    currentAgentState = newAgentState
    isFirstStep = false
  }

  return { agentState }
}
