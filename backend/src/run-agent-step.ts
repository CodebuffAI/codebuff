import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import {
  AgentResponseTrace,
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { consumeCreditsWithFallback } from '@codebuff/billing'
import { trackEvent } from '@codebuff/common/analytics'
import {
  HIDDEN_FILE_READ_STATUS,
  ONE_TIME_LABELS,
} from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  getToolCallString,
  renderToolResults,
} from '@codebuff/common/constants/tools'
import {
  AgentState,
  ToolResult,
  type AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { parseFileBlocks, ProjectFileContext } from '@codebuff/common/util/file'
import { toContentString } from '@codebuff/common/util/messages'
import { generateCompactId } from '@codebuff/common/util/string'
import { difference, partition, uniq } from 'lodash'
import { ServerWebSocket } from 'bun'

import { CodebuffMessage } from '@codebuff/common/types/message'
import { CoreMessage } from 'ai'
import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from './find-files/request-files-prompt'
import { checkLiveUserInput } from './live-user-inputs'
import { fetchContext7LibraryDocumentation } from './llm-apis/context7-api'
import { searchWeb } from './llm-apis/linkup-api'
import { processFileBlock } from './process-file-block'
import { processStrReplace } from './process-str-replace'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { agentTemplates } from './templates/agent-list'
import { formatPrompt, getAgentPrompt } from './templates/strings'
import {
  ClientToolCall,
  CodebuffToolCall,
  parseRawToolCall,
  TOOL_LIST,
  ToolName,
  toolParams,
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
import { PROFIT_MARGIN } from './llm-apis/message-cost-tracker'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

const MAX_AGENT_STEPS = 20

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
  ws: ServerWebSocket<any>,
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

  const fileRequestMessagesTokens = countTokensJson(messagesWithUserPrompt)

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
    { type: 'agentStepPrompt' },
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
        { type: 'userInputPrompt' },
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
    { type: 'systemPrompt' },
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
    `Agent step ${agentType} - ${iterationNum}`
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
      web_search: toolCallback('web_search', async (toolCall) => {
        const { query, depth } = (
          toolCall as Extract<CodebuffToolCall, { toolName: 'web_search' }>
        ).args

        logger.debug(
          {
            query,
            depth,
          },
          'web_search tool call'
        )

        try {
          const searchResult = await searchWeb(query, {
            depth,
          })

          // Charge credits for web search usage
          if (userId) {
            // Calculate credits based on search depth with profit margin
            const creditsToCharge = Math.round(
              (depth === 'deep' ? 5 : 1) * (1 + PROFIT_MARGIN)
            )

            const requestContext = getRequestContext()
            const repoUrl = requestContext?.processedRepoUrl

            const result = await consumeCreditsWithFallback({
              userId,
              creditsToCharge,
              repoUrl,
              context: 'web search',
            })

            if (!result.success) {
              logger.error(
                { error: result.error, query, depth, userId },
                'Failed to charge credits for web search'
              )
            }
          }

          if (searchResult) {
            serverToolResults.push({
              toolName: 'web_search',
              toolCallId: toolCall.toolCallId,
              result: searchResult,
            })
          } else {
            serverToolResults.push({
              toolName: 'web_search',
              toolCallId: toolCall.toolCallId,
              result: `No search results found for "${query}". Try refining your search query or using different keywords.`,
            })
          }
        } catch (error) {
          logger.error(
            { error, query, depth },
            'Error performing web search with Linkup API'
          )
          serverToolResults.push({
            toolName: 'web_search',
            toolCallId: toolCall.toolCallId,
            result: `Error performing web search for "${query}": ${error instanceof Error ? error.message : 'Unknown error'}`,
          })
        }
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
      read_docs: toolCallback('read_docs', async (toolCall) => {
        const { libraryTitle, topic, max_tokens } = (
          toolCall as Extract<CodebuffToolCall, { toolName: 'read_docs' }>
        ).args

        logger.debug(
          {
            libraryTitle,
            topic,
            max_tokens,
          },
          'read_docs tool call'
        )

        try {
          const documentation = await fetchContext7LibraryDocumentation(libraryTitle, {
            topic,
            tokens: max_tokens,
          })

          if (documentation) {
            serverToolResults.push({
              toolName: 'read_docs',
              toolCallId: toolCall.toolCallId,
              result: documentation,
            })
          } else {
            serverToolResults.push({
              toolName: 'read_docs',
              toolCallId: toolCall.toolCallId,
              result: `No documentation found for "${libraryTitle}"${topic ? ` with topic "${topic}"` : ''}. Try using the exact library name (e.g., "Next.js", "React", "MongoDB"). The library may not be available in Context7's database.`,
            })
          }
        } catch (error) {
          logger.error(
            { error, libraryTitle, topic, max_tokens },
            'Error fetching documentation from Context7'
          )
          serverToolResults.push({
            toolName: 'read_docs',
            toolCallId: toolCall.toolCallId,
            result: `Error fetching documentation for "${libraryTitle}": ${error instanceof Error ? error.message : 'Unknown error'}`,
          })
        }
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
      toolCall.toolName === 'add_subgoal' ||
      toolCall.toolName === 'update_subgoal' ||
      toolCall.toolName === 'code_search' ||
      toolCall.toolName === 'run_terminal_command' ||
      toolCall.toolName === 'browser_logs' ||
      toolCall.toolName === 'think_deeply' ||
      toolCall.toolName === 'create_plan' ||
      toolCall.toolName === 'end_turn' ||
      toolCall.toolName === 'web_search' ||
      toolCall.toolName === 'read_docs'
    ) {
      // Handled above
    } else if (toolCall.toolName === 'read_files') {
      const paths = (
        toolCall as Extract<CodebuffToolCall, { toolName: 'read_files' }>
      ).args.paths

      const { addedFiles, updatedFilePaths } = await getFileReadingUpdates(
        ws,
        messagesWithResponse,
        fileContext,
        {
          requestedFiles: paths,
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
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

      const system = getSearchSystemPrompt(
        fileContext,
        fileRequestMessagesTokens,
        {
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
        }
      )
      const messages = messagesWithResponse
      const requestedFiles = await requestRelevantFiles(
        { messages, system },
        fileContext,
        description,
        agentStepId,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        repoId
      )
      if (requestedFiles && requestedFiles.length > 0) {
        const { addedFiles, updatedFilePaths, printedPaths } =
          await getFileReadingUpdates(ws, messages, fileContext, {
            requestedFiles,
            agentStepId,
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
            repoId,
          })
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
              ? renderReadFilesResult(
                  addedFiles,
                  fileContext.tokenCallers ?? {}
                )
              : `No new relevant files found for description: ${description}`,
        })
        if (printedPaths.length > 0) {
          onResponseChunk('\n\n')
          onResponseChunk(
            getToolCallString('read_files', {
              paths: printedPaths.join('\n'),
            })
          )
        }

        if (COLLECT_FULL_FILE_CONTEXT) {
          uploadExpandedFileContextForTraining(
            ws,
            { messages, system },
            fileContext,
            description,
            agentStepId,
            clientSessionId,
            fingerprintId,
            userInputId,
            userId,
            repoId
          ).catch((error) => {
            logger.error(
              { error },
              'Error uploading expanded file context for training'
            )
          })
        }
      } else {
        serverToolResults.push({
          toolName: 'find_files',
          toolCallId: toolCall.toolCallId,
          result: `No relevant files found for description: ${description}`,
        })
      }
    } else if (toolCall.toolName === 'spawn_agents') {
      const { agents } = toolCall.args
      const parentAgentTemplate = agentTemplate

      let userMessageWithConversationHistory: CoreMessage | undefined

      const getUserMessageWithConversationHistory = async () => {
        if (userMessageWithConversationHistory) {
          return userMessageWithConversationHistory
        }
        // We want to include all the latest file changes and other tool results in the passed-on message history.
        const fileProcessingPromises = Object.values(
          fileProcessingPromisesByPath
        ).flat()
        const fileChanges = await Promise.all(fileProcessingPromises)
        const fileChangeToolResults = fileChanges.map((result) => ({
          toolName: result.tool,
          toolCallId: generateCompactId(),
          result: 'error' in result ? result.error : JSON.stringify(result),
        }))
        const toolResults = [...serverToolResults, ...fileChangeToolResults]
        const toolResultMessage = {
          role: 'user' as const,
          content: renderToolResults(toolResults),
        }
        const messageHistory = [
          ...expireMessages(messagesWithResponse, 'userPrompt'),
          toolResultMessage,
        ]
        userMessageWithConversationHistory = {
          role: 'user' as const,
          content: `For context, the following is the conversation history between the user and an assistant:\n\n${JSON.stringify(messageHistory, null, 2)}`,
        }
        return userMessageWithConversationHistory
      }

      const results = await Promise.allSettled(
        agents.map(async ({ agent_type: agentTypeStr, prompt, params }) => {
          if (!(agentTypeStr in agentTemplates)) {
            throw new Error(`Agent type ${agentTypeStr} not found.`)
          }
          const agentType = agentTypeStr as AgentTemplateType
          const agentTemplate = agentTemplates[agentType]

          if (!parentAgentTemplate.spawnableAgents.includes(agentType)) {
            throw new Error(
              `Agent type ${parentAgentTemplate.type} is not allowed to spawn child agent type ${agentType}.`
            )
          }

          // Validate prompt and params against agent's schema
          const { promptSchema } = agentTemplate

          // Validate prompt requirement
          if (promptSchema.prompt === true && !prompt) {
            throw new Error(
              `Agent ${agentType} requires a prompt but none was provided.`
            )
          }

          // Validate params if schema exists
          if (promptSchema.params && params) {
            const result = promptSchema.params.safeParse(params)
            if (!result.success) {
              throw new Error(
                `Invalid params for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`
              )
            }
          }

          logger.debug(
            { agentTemplate, prompt, params },
            `Spawning agent — ${agentType}`
          )
          const subAgentMessages: CoreMessage[] = []
          if (agentTemplate.includeMessageHistory) {
            subAgentMessages.push(await getUserMessageWithConversationHistory())
          }

          const agentId = generateCompactId()
          const agentState: AgentState = {
            agentId,
            agentType,
            agentContext: '',
            subagents: [],
            messageHistory: subAgentMessages,
            stepsRemaining: MAX_AGENT_STEPS,
            report: {},
          }

          return await loopAgentSteps(ws, {
            userInputId: `${userInputId}-${agentType}${agentId}`,
            prompt: prompt || '',
            params,
            agentType: agentTemplate.type,
            agentState,
            fingerprintId,
            fileContext,
            toolResults: [],
            userId,
            clientSessionId,
            onResponseChunk: () => {},
          })
        })
      )

      const reports = results.map((result) => {
        if (result.status === 'fulfilled') {
          const { agentState } = result.value
          const agentTemplate = agentTemplates[agentState.agentType!]
          if (agentTemplate.outputMode === 'report') {
            return JSON.stringify(result.value.agentState.report, null, 2)
          } else if (agentTemplate.outputMode === 'last_message') {
            const { agentState } = result.value
            const assistantMessages = agentState.messageHistory.filter(
              (message) => message.role === 'assistant'
            )
            const lastAssistantMessage =
              assistantMessages[assistantMessages.length - 1]
            if (!lastAssistantMessage) {
              return 'No response from agent'
            }
            if (typeof lastAssistantMessage.content === 'string') {
              return lastAssistantMessage.content
            } else {
              return JSON.stringify(lastAssistantMessage.content, null, 2)
            }
          } else if (agentTemplate.outputMode === 'all_messages') {
            const { agentState } = result.value
            // Remove the first message, which includes the previous conversation history.
            const agentMessages = agentState.messageHistory.slice(1)
            return `Agent messages:\n\n${JSON.stringify(agentMessages, null, 2)}`
          }
          throw new Error(`Unknown output mode: ${agentTemplate.outputMode}`)
        } else {
          return `Error spawning agent: ${result.reason}`
        }
      })

      serverToolResults.push({
        toolName: 'spawn_agents',
        toolCallId: toolCall.toolCallId,
        result: reports
          .map((report: string) => `<agent_report>${report}</agent_report>`)
          .join('\n'),
      })
    } else if (toolCall.toolName === 'update_report') {
      const { json_update: jsonUpdate } = toolCall.args
      agentState.report = {
        ...agentState.report,
        ...jsonUpdate,
      }
      logger.debug(
        {
          jsonUpdate,
          agentType: agentState.agentType,
          agentId: agentState.agentId,
        },
        'update_report tool call'
      )
      serverToolResults.push({
        toolName: 'update_report',
        toolCallId: toolCall.toolCallId,
        result: 'Report updated',
      })
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

  for (const clientToolCall of clientToolCalls) {
    if (!checkLiveUserInput(userId, userInputId)) {
      return { agentState, fullResponse: '', shouldEndTurn: true }
    }
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
    `Agent step complete ${agentType} - ${iterationNum}`
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
  ws: ServerWebSocket<any>,
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
  ws: ServerWebSocket<any>,
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
  ws: ServerWebSocket<any>,
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
            agentTemplates[agentType].toolNames,
            agentTemplates[agentType].spawnableAgents,
            prompt ?? ''
          )
        : '',
      assistantPrefix: currentAssistantPrefix
        ? formatPrompt(
            currentAssistantPrefix,
            fileContext,
            currentAgentState,
            agentTemplates[agentType].toolNames,
            agentTemplates[agentType].spawnableAgents,
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
