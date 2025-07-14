import {
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { consumeCreditsWithFallback } from '@codebuff/billing'
import {
  AgentState,
  AgentTemplateType,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { CodebuffMessage } from '@codebuff/common/types/message'
import { WebSocket } from 'ws'
import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from './features/files/processing/request-files-prompt'
import { getFileReadingUpdates } from './get-file-reading-updates'
import { fetchContext7LibraryDocumentation } from './features/llm/providers/context7-api'
import { searchWeb } from './features/llm/providers/linkup-api'
import { PROFIT_MARGIN } from './features/llm/providers/message-cost-tracker'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { agentRegistry } from './features/agents/templates/static/agent-registry'
import { AgentTemplate, ProgrammaticAgentTemplate } from './features/agents/templates/static/types'
import { ClientToolCall, CodebuffToolCall } from './features/tools/constants'
import { logger } from './util/logger'
import { renderReadFilesResult } from './util/parse-tool-call-xml'
import { countTokens, countTokensJson } from './util/token-counter'
import { getRequestContext } from './features/websockets/request-context'
import {
  requestFiles,
  requestToolCall,
} from './features/websockets/websocket-action'
import { TextBlock } from './features/llm/providers/claude'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false
export interface RunToolOptions {
  ws: WebSocket
  userId?: string
  userInputId: string
  clientSessionId: string
  fingerprintId: string
  agentStepId: string
  fileContext: ProjectFileContext
  messages: CodebuffMessage[]
  agentTemplate: AgentTemplate | ProgrammaticAgentTemplate
  repoId?: string
  // Additional context for update_report
  agentState?: AgentState
}

export type RunToolResult =
  | { type: 'server_result'; result: ToolResult }
  | { type: 'client_call'; call: ClientToolCall }
  | { type: 'no_result' }
  | { type: 'state_update'; result: ToolResult; updatedAgentState: AgentState }

export async function runTool(
  toolCall: CodebuffToolCall,
  options: RunToolOptions
): Promise<ToolResult> {
  const { ws, userInputId, agentState } = options

  try {
    // Execute the tool call using runToolInner
    const toolResult = await runToolInner(toolCall, options)

    if (toolResult.type === 'server_result') {
      // Direct server result - return as-is
      return toolResult.result
    } else if (toolResult.type === 'client_call') {
      // For client calls, execute them via WebSocket and return the result
      const clientResult = await requestToolCall(
        ws,
        userInputId,
        toolResult.call.toolName,
        toolResult.call.args
      )

      return {
        toolName: toolResult.call.toolName,
        toolCallId: toolResult.call.toolCallId,
        result: clientResult.success
          ? clientResult.result
          : clientResult.error ?? 'Unknown error',
      }
    } else if (toolResult.type === 'state_update') {
      if (!agentState) {
        throw new Error('agentState is required for state_update')
      }
      // Update the agent state and return the result
      Object.assign(agentState, toolResult.updatedAgentState!)
      return toolResult.result
    } else {
      // no_result type - return a success message
      return {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        result: 'Tool executed successfully',
      }
    }
  } catch (error) {
    logger.error({ error, toolCall }, 'Error executing tool call in runTool')

    // Return error as tool result
    return {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      result: `Error executing ${toolCall.toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Executes a tool call and returns the appropriate result
 */
export async function runToolInner(
  toolCall: CodebuffToolCall,
  options: RunToolOptions
): Promise<RunToolResult> {
  const {
    ws,
    userId,
    userInputId,
    clientSessionId,
    fingerprintId,
    agentStepId,
    fileContext,
    messages,
    repoId,
  } = options

  const { toolName, args } = toolCall

  switch (toolName) {
    case 'web_search': {
      const { query, depth } = args
      const searchStartTime = Date.now()
      const searchContext = {
        toolCallId: toolCall.toolCallId,
        query,
        depth,
        userId,
        agentStepId,
        clientSessionId,
        fingerprintId,
        userInputId,
        repoId,
      }

      try {
        const searchResult = await searchWeb(query, { depth: depth || 'standard' })
        const searchDuration = Date.now() - searchStartTime
        const resultLength = searchResult?.length || 0
        const hasResults = Boolean(searchResult && searchResult.trim())

        // Charge credits for web search usage
        let creditResult = null
        if (userId) {
          const creditsToCharge = Math.round(
            (depth === 'deep' ? 5 : 1) * (1 + PROFIT_MARGIN)
          )
          const requestContext = getRequestContext()
          const repoUrl = requestContext?.processedRepoUrl

          creditResult = await consumeCreditsWithFallback({
            userId,
            creditsToCharge,
            repoUrl,
            context: 'web search',
          })

          if (!creditResult.success) {
            logger.error(
              {
                ...searchContext,
                error: creditResult.error,
                creditsToCharge,
                searchDuration,
              },
              'Failed to charge credits for web search'
            )
          }
        }

        logger.info(
          {
            ...searchContext,
            searchDuration,
            resultLength,
            hasResults,
            creditsCharged: creditResult?.success
              ? depth === 'deep'
                ? 5
                : 1
              : 0,
            success: true,
          },
          'Search completed'
        )

        if (searchResult) {
          return {
            type: 'server_result',
            result: {
              toolName: 'web_search',
              toolCallId: toolCall.toolCallId,
              result: searchResult,
            },
          }
        } else {
          logger.warn(
            {
              ...searchContext,
              searchDuration,
            },
            'No results returned from search API'
          )
          return {
            type: 'server_result',
            result: {
              toolName: 'web_search',
              toolCallId: toolCall.toolCallId,
              result: `No search results found for "${query}". Try refining your search query or using different keywords.`,
            },
          }
        }
      } catch (error) {
        const searchDuration = Date.now() - searchStartTime
        logger.error(
          {
            ...searchContext,
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                  }
                : error,
            searchDuration,
            success: false,
          },
          'Search failed with error'
        )
        return {
          type: 'server_result',
          result: {
            toolName: 'web_search',
            toolCallId: toolCall.toolCallId,
            result: `Error performing web search for "${query}": ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        }
      }
    }

    case 'read_docs': {
      const { libraryTitle, topic, max_tokens } = args
      const docsStartTime = Date.now()
      const docsContext = {
        toolCallId: toolCall.toolCallId,
        libraryTitle,
        topic,
        max_tokens,
        userId,
        agentStepId,
        clientSessionId,
        fingerprintId,
        userInputId,
        repoId,
      }

      try {
        const documentation = await fetchContext7LibraryDocumentation(
          libraryTitle,
          {
            topic,
            tokens: max_tokens,
          }
        )

        const docsDuration = Date.now() - docsStartTime
        const resultLength = documentation?.length || 0
        const hasResults = Boolean(documentation && documentation.trim())
        const estimatedTokens = Math.ceil(resultLength / 4)

        logger.info(
          {
            ...docsContext,
            docsDuration,
            resultLength,
            estimatedTokens,
            hasResults,
            success: true,
          },
          'Documentation request completed successfully'
        )

        if (documentation) {
          return {
            type: 'server_result',
            result: {
              toolName: 'read_docs',
              toolCallId: toolCall.toolCallId,
              result: documentation,
            },
          }
        } else {
          logger.warn(
            {
              ...docsContext,
              docsDuration,
            },
            'No documentation found in Context7 database'
          )
          return {
            type: 'server_result',
            result: {
              toolName: 'read_docs',
              toolCallId: toolCall.toolCallId,
              result: `No documentation found for "${libraryTitle}"${
                topic ? ` with topic "${topic}"` : ''
              }. Try using the exact library name (e.g., "Next.js", "React", "MongoDB"). The library may not be available in Context7's database.`,
            },
          }
        }
      } catch (error) {
        const docsDuration = Date.now() - docsStartTime
        logger.error(
          {
            ...docsContext,
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                  }
                : error,
            docsDuration,
            success: false,
          },
          'Documentation request failed with error'
        )
        return {
          type: 'server_result',
          result: {
            toolName: 'read_docs',
            toolCallId: toolCall.toolCallId,
            result: `Error fetching documentation for "${libraryTitle}": ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        }
      }
    }

    case 'read_files': {
      const { paths } = args
      const { addedFiles, updatedFilePaths } = await getFileReadingUpdates(
        ws,
        messages,
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

      return {
        type: 'server_result',
        result: {
          toolName: 'read_files',
          toolCallId: generateCompactId(),
          result: renderReadFilesResult(
            addedFiles,
            fileContext.tokenCallers ?? {}
          ),
        },
      }
    }

    case 'find_files': {
      const { description } = args
      const fileRequestMessagesTokens = countTokensJson(messages)
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

        if (COLLECT_FULL_FILE_CONTEXT && addedFiles.length > 0) {
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

        return {
          type: 'server_result',
          result: {
            toolName: 'find_files',
            toolCallId: generateCompactId(),
            result:
              addedFiles.length > 0
                ? renderReadFilesResult(
                    addedFiles,
                    fileContext.tokenCallers ?? {}
                  )
                : `No new relevant files found for description: ${description}`,
          },
        }
      } else {
        return {
          type: 'server_result',
          result: {
            toolName: 'find_files',
            toolCallId: toolCall.toolCallId,
            result: `No relevant files found for description: ${description}`,
          },
        }
      }
    }

    case 'code_search':
    case 'browser_logs':
    case 'run_file_change_hooks':
    case 'end_turn': {
      return {
        type: 'client_call',
        call: {
          ...toolCall,
        },
      }
    }

    case 'run_terminal_command': {
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
      return {
        type: 'client_call',
        call: clientToolCall,
      }
    }

    case 'think_deeply': {
      const { thought } = args
      logger.debug(
        {
          thought,
        },
        'Thought deeply'
      )
      return { type: 'no_result' }
    }

    case 'update_report': {
      const { json_update: jsonUpdate } = args
      const { agentState } = options

      if (!agentState) {
        throw new Error('update_report requires agentState in options')
      }

      const updatedAgentState: AgentState = {
        ...agentState,
        report: {
          ...agentState.report,
          ...jsonUpdate,
        },
      }

      logger.debug(
        {
          jsonUpdate,
          agentType: agentState.agentType,
          agentId: agentState.agentId,
        },
        'update_report tool call'
      )

      return {
        type: 'state_update',
        result: {
          toolName: 'update_report',
          toolCallId: toolCall.toolCallId,
          result: 'Report updated',
        },
        updatedAgentState,
      }
    }

    case 'spawn_agents': {
      const { agents } = toolCall.args
      const { agentTemplate: parentAgentTemplate, fileContext } = options

      if (!parentAgentTemplate) {
        throw new Error('spawn_agents requires agentTemplate in options')
      }

      // Initialize registry and get all templates
      agentRegistry.initialize(fileContext)
      const allTemplates = agentRegistry.getAllTemplates()

      const conversationHistoryMessage: CodebuffMessage = {
        role: 'user',
        content: `For context, the following is the conversation history between the user and an assistant:\n\n${JSON.stringify(
          messages,
          null,
          2
        )}`,
      }

      const results = await Promise.allSettled(
        agents.map(async ({ agent_type: agentTypeStr, prompt, params }: { agent_type: string; prompt?: string; params?: any }) => {
          if (!(agentTypeStr in allTemplates)) {
            throw new Error(`Agent type ${agentTypeStr} not found.`)
          }
          const agentType = agentTypeStr as AgentTemplateType
          const agentTemplate = allTemplates[agentType]

          if (!parentAgentTemplate.spawnableAgents.includes(agentType)) {
            throw new Error(
              `Agent type ${parentAgentTemplate.id} is not allowed to spawn child agent type ${agentType}.`
            )
          }

          // Validate prompt and params against agent's schema
          const { promptSchema } = agentTemplate

          // Validate prompt requirement
          if (promptSchema.prompt) {
            const result = promptSchema.prompt.safeParse(prompt)
            if (!result.success) {
              throw new Error(
                `Invalid prompt for agent ${agentType}: ${JSON.stringify(result.error.issues, null, 2)}`
              )
            }
          }

          // Validate params if schema exists
          if (promptSchema.params) {
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
          const subAgentMessages: CodebuffMessage[] = []
          if (agentTemplate.includeMessageHistory) {
            subAgentMessages.push(conversationHistoryMessage)
          }

          const agentId = generateCompactId()
          const agentState: AgentState = {
            agentId,
            agentType,
            agentContext: '',
            subagents: [],
            messageHistory: subAgentMessages,
            stepsRemaining: 20, // MAX_AGENT_STEPS
            report: {},
          }

          // Import loopAgentSteps dynamically to avoid circular dependency
          const { loopAgentSteps } = await import('./features/agents/execution/run-agent-step')
          const result = await loopAgentSteps(ws, {
            userInputId: `${userInputId}-${agentType}${agentId}`,
            prompt: prompt || '',
            params,
            agentType: agentTemplate.id,
            agentState,
            fingerprintId,
            fileContext,
            toolResults: [],
            userId,
            clientSessionId,
            onResponseChunk: () => {},
          })

          return {
            ...result,
            agentType,
            agentName:
              agentRegistry.getAgentName(agentType) || agentTemplate.name,
          }
        })
      )

      const reports = results.map((result, index) => {
        const agentInfo = agents[index]
        const agentTypeStr = agentInfo.agent_type as string

        if (result.status === 'fulfilled') {
          const { agentState, agentName } = result.value
          const agentTemplate = allTemplates[agentState.agentType!]
          let report = ''

          if (
            agentTemplate.implementation === 'programmatic' ||
            agentTemplate.outputMode === 'report'
          ) {
            report = JSON.stringify(result.value.agentState.report, null, 2)
          } else if (agentTemplate.outputMode === 'last_message') {
            const { agentState } = result.value
            const assistantMessages = agentState.messageHistory.filter(
              (message: any) => message.role === 'assistant'
            )
            const lastAssistantMessage =
              assistantMessages[assistantMessages.length - 1]
            if (!lastAssistantMessage) {
              report = 'No response from agent'
            } else if (typeof lastAssistantMessage.content === 'string') {
              report = lastAssistantMessage.content
            } else {
              report = JSON.stringify(lastAssistantMessage.content, null, 2)
            }
          } else if (agentTemplate.outputMode === 'all_messages') {
            const { agentState } = result.value
            // Remove the first message, which includes the previous conversation history.
            const agentMessages = agentState.messageHistory.slice(1)
            report = `Agent messages:\n\n${JSON.stringify(agentMessages, null, 2)}`
          } else {
            throw new Error(
              `Unknown output mode: ${'outputMode' in agentTemplate ? agentTemplate.outputMode : 'undefined'}`
            )
          }

          return `**${agentName}:**\n${report}`
        } else {
          return `**Agent (${agentTypeStr}):**\nError spawning agent: ${result.reason}`
        }
      })
      return {
        type: 'server_result',
        result: {
          toolName: 'spawn_agents',
          toolCallId: toolCall.toolCallId,
          result: reports
            .map((report: string) => `<agent_report>${report}</agent_report>`)
            .join('\n'),
        },
      }
    }

    case 'add_subgoal':
    case 'update_subgoal':
    case 'write_file':
    case 'str_replace':
    case 'create_plan': {
      // These need special handling in the calling context
      throw new Error(`Not implemented here: ${toolName}`)
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

async function uploadExpandedFileContextForTraining(
  ws: WebSocket,
  {
    messages,
    system,
  }: {
    messages: CodebuffMessage[]
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
