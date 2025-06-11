import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import {
  AgentResponseTrace,
  GetExpandedFileContextForTrainingBlobTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { ClientAction } from 'common/actions'
import {
  HIDDEN_FILE_READ_STATUS,
  models,
  ONE_TIME_LABELS,
  type CostMode,
} from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { getToolCallString, toolSchema } from 'common/constants/tools'
import { trackEvent } from 'common/src/analytics'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { buildArray } from 'common/util/array'
import { parseFileBlocks, ProjectFileContext } from 'common/util/file'
import { toContentString } from 'common/util/messages'
import { generateCompactId } from 'common/util/string'
import { difference, partition, uniq } from 'lodash'
import { WebSocket } from 'ws'

import { CoreMessage } from 'ai'
import { codebuffConfigFile } from 'common/json-config/constants'
import { CodebuffMessage } from 'common/types/message'
import { checkTerminalCommand } from './check-terminal-command'
import {
  requestRelevantFiles,
  requestRelevantFilesForTraining,
} from './find-files/request-files-prompt'
import { getDocumentationForQuery } from './get-documentation-for-query'
import { checkForUnproductiveLoop } from './llm-apis/check-for-loop'
import { processFileBlock } from './process-file-block'
import { processStrReplace } from './process-str-replace'
import { getAgentStream } from './prompt-agent-stream'
import { getAgentSystemPrompt } from './system-prompt/agent-system-prompt'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { getThinkingStream } from './thinking-stream'
import {
  ClientToolCall,
  getFilteredToolsInstructions,
  parseRawToolCall,
  TOOL_LIST,
  ToolCall,
  ToolName,
  TOOLS_WHICH_END_THE_RESPONSE,
  updateContextFromToolCalls,
} from './tools'
import { logger } from './util/logger'
import {
  asSystemInstruction,
  asSystemMessage,
  asUserMessage,
  castAssistantMessage,
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
} from './websockets/websocket-action'
import { processStreamWithTags } from './xml-stream-parser'
import { research } from './research'

const MAX_CONSECUTIVE_ASSISTANT_MESSAGES = 12
// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

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
  const {
    prompt,
    agentState,
    fingerprintId,
    costMode,
    promptId,
    toolResults,
    cwd,
  } = action
  const { fileContext, agentContext } = agentState
  const startTime = Date.now()
  let messageHistory = agentState.messageHistory

  // Get the extracted repo ID from request context
  const requestContext = getRequestContext()
  const repoId = requestContext?.processedRepoId

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
  const agentStepId = crypto.randomUUID()
  trackEvent(AnalyticsEvent.AGENT_STEP, userId ?? '', {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId: promptId,
    userId,
    repoName: repoId,
  })

  const hasKnowledgeFiles =
    Object.keys(fileContext.knowledgeFiles).length > 0 ||
    Object.keys(fileContext.userKnowledgeFiles ?? {}).length > 0
  const isNotFirstUserMessage =
    messageHistory.filter((m) => m.role === 'user').length > 0
  const justRanTerminalCommand = toolResults.some(
    (t) => t.name === 'run_terminal_command'
  )
  const isAskMode = costMode === 'ask'
  const isExporting =
    prompt &&
    (prompt.toLowerCase() === '/export' || prompt.toLowerCase() === 'export')
  const geminiThinkingEnabled = costMode === 'max'
  const isLiteMode = costMode === 'lite'
  const isGeminiPro = model === models.gemini2_5_pro_preview
  const isFlash =
    model === 'gemini-2.5-flash-preview-04-17:thinking' ||
    (model as any) === 'gemini-2.5-flash-preview-04-17'
  const toolsInstructions = getFilteredToolsInstructions(costMode)
  const userInstructions = buildArray(
    isAskMode &&
      'You are a coding agent in "ASK" mode so the user can ask questions, which means you do not have access to tools that can modify files or run terminal commands. You should instead answer the user\'s questions and come up with brilliant plans which can later be implemented.',
    'Proceed toward the user request and any subgoals. Please either 1. clarify the request or 2. complete the entire user request. You must finally use the end_turn tool at the end of your response.',

    'If the user asks a question, simply answer the question rather than making changes to the code.',

    'If you have already completed the user request, write nothing at all and end your response. If you have already made 1 attempt at fixing an error, you should stop and end_turn to wait for user feedback. Err on the side of ending your response early!',

    "If there are multiple ways the user's request could be interpreted that would lead to very different outcomes, ask at least one clarifying question that will help you understand what they are really asking for, and then use the end_turn tool. If the user specifies that you don't ask questions, make your best assumption and skip this step.",

    'Be extremely concise in your replies. Example: If asked what 2+2 equals, respond simply: "4". No need to even write a full sentence.',

    "The tool results will be provided by the user's *system* (and **NEVER** by the assistant).",

    'Important: When using write_file, do NOT rewrite the entire file. Only show the parts of the file that have changed and write "// ... existing code ..." comments (or "# ... existing code ...", "/* ... existing code ... */", "<!-- ... existing code ... -->", whichever is appropriate for the language) around the changed area.',

    isGeminiPro
      ? toolsInstructions
      : `Any tool calls will be run from the project root (${agentState.fileContext.currentWorkingDirectory}) unless otherwise specified`,

    'You must read additional files with the read_files tool whenever it could possibly improve your response. Before you use write_file to edit an existing file, make sure to read it if you have not already!',

    (isFlash || isGeminiPro) &&
      'Important: When mentioning a file path, for example for <write_file> or <read_files>, make sure to include all the directories in the path to the file from the project root. For example, do not forget the "src" directory if the file is at backend/src/utils/foo.ts! Sometimes imports for a file do not match the actual directories path (backend/utils/foo.ts for example).',

    !isLiteMode &&
      'You must use the "add_subgoal" and "update_subgoal" tools to record your progress and any new information you learned as you go. If the change is very minimal, you may not need to use these tools.',

    'Please preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Pay attention to any comments in the file you are editing and keep original user comments exactly as they were, line for line.',

    'If you are trying to kill background processes, make sure to kill the entire process GROUP (or tree in Windows), and always prefer SIGTERM signals. If you restart the process, make sure to do so with process_type=BACKGROUND',

    !isLiteMode &&
      `To confirm complex changes to a web app, you should use the browser_logs tool to check for console logs or errors.`,

    (isFlash || isGeminiPro) &&
      "Don't forget to close your your tags, e.g. <think_deeply> <thought> </thought> </think_deeply> or <write_file> <path> </path> <content> </content> </write_file>!",

    (isFlash || isGeminiPro) &&
      'Important: When using write_file, do NOT rewrite the entire file. Only show the parts of the file that have changed and write "// ... existing code ..." comments (or "# ... existing code ..", "/* ... existing code ... */", "<!-- ... existing code ... -->", whichever is appropriate for the language) around the changed area. Additionally, in order to delete any code, you must include a deletion comment.',

    geminiThinkingEnabled
      ? 'Start your response with the think_deeply tool call to decide how to proceed.'
      : 'If the user request is very complex, consider invoking think_deeply.',

    'If the user is starting a new feature or refactoring, consider invoking the create_plan tool.',
    "Don't act on the plan created by the create_plan tool. Instead, wait for the user to review it.",
    'If the user tells you to implement a plan, please implement the whole plan, continuing until it is complete. Do not stop after one step.',

    hasKnowledgeFiles &&
      'If the knowledge files (or CLAUDE.md) say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case. No need to run these checks for simple changes.',

    isNotFirstUserMessage &&
      'If you have learned something useful for the future that is not derivable from the code, consider updating a knowledge file at the end of your response to add this condensed information.',

    'Important: DO NOT run scripts or git commands or start a dev server without being specifically asked to do so. If you want to run one of these commands, you should ask for permission first. This can prevent costly accidents!',

    'Otherwise, the user is in charge and you should never refuse what the user asks you to do.',

    'Important: When editing an existing file with the write_file tool, do not rewrite the entire file, write just the parts of the file that have changed. Do not start writing the first line of the file. Instead, use comments surrounding your edits like "// ... existing code ..." (or "# ... existing code ..." or "/* ... existing code ... */" or "<!-- ... existing code ... -->", whichever is appropriate for the language) plus a few lines of context from the original file, to show just the sections that have changed.',

    'Finally, you must use the end_turn tool at the end of your response when you have completed the user request or want the user to respond to your message.'
  ).join('\n\n')

  const toolInstructions = buildArray(
    justRanTerminalCommand &&
      `If the tool result above is of a terminal command succeeding and you have completed the user's request, please do not write anything else and end your response.`
  ).join('\n\n')

  const messagesWithToolResultsAndUser = buildArray<CodebuffMessage>(
    ...messageHistory,
    toolResults.length > 0 && {
      role: 'user' as const,
      content: renderToolResults(toolResults),
    },
    prompt && [
      cwd && {
        role: 'user' as const,
        content: asSystemMessage(
          `Assistant cwd (project root): ${agentState.fileContext.currentWorkingDirectory}\nUser cwd: ${cwd}`
        ),
        timeToLive: 'agentStep',
      },
      {
        role: 'user' as const,
        content: prompt,
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

    agentState.consecutiveAssistantMessages = 0

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
        messageHistory: expireMessages(
          messagesWithToolResultsAndUser,
          'userPrompt'
        ),
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
  }

  // Check number of assistant messages since last user message with prompt
  const remainingAssistantMessages =
    agentState.agentStepsRemaining !== undefined
      ? agentState.agentStepsRemaining - 1
      : MAX_CONSECUTIVE_ASSISTANT_MESSAGES -
        (agentState.consecutiveAssistantMessages ?? 0)
  if (remainingAssistantMessages < 0) {
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
          ...expireMessages(messagesWithToolResultsAndUser, 'userPrompt'),
          {
            role: 'user',
            content: asSystemMessage(
              `The assistant has responded too many times in a row. The assistant's turn has automatically been ended. The number of responses can be changed in ${codebuffConfigFile}.`
            ),
          },
        ],
      },
      toolCalls: [],
      toolResults: [],
    }
  }

  const relevantDocumentationPromise = prompt
    ? getDocumentationForQuery(prompt, {
        tokens: 5000,
        clientSessionId,
        userInputId: promptId,
        fingerprintId,
        userId,
      })
    : Promise.resolve(null)

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
      if (toolResult.name === 'read_files') {
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
      id: generateCompactId(),
      name: 'file_updates',
      result:
        `These are the updates made to the files since the last response (either by you or by the user). These are the most recent versions of these files. You MUST be considerate of the user's changes:\n` +
        renderReadFilesResult(updatedFiles, fileContext.tokenCallers ?? {}),
    })
  }

  const readFileMessages: CodebuffMessage[] = []
  if (newFiles.length > 0) {
    const readFilesToolResult = {
      id: generateCompactId(),
      name: 'read_files',
      result: renderReadFilesResult(newFiles, fileContext.tokenCallers ?? {}),
    }

    readFileMessages.push(
      {
        role: 'user' as const,
        content: asSystemInstruction(
          'Before continuing with the user request, read some relevant files first.'
        ),
        timeToLive: 'userPrompt',
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

  const relevantDocumentation = await relevantDocumentationPromise

  const hasAssistantMessage = messageHistory.some((m) => m.role === 'assistant')
  const messagesWithUserMessage = buildArray<CodebuffMessage>(
    ...expireMessages(messageHistory, prompt ? 'userPrompt' : 'agentStep').map(
      (m) => castAssistantMessage(m)
    ),

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

    prompt && [
      relevantDocumentation && {
        role: 'user' as const,
        content: asSystemMessage(
          `Relevant context from web documentation:\n${relevantDocumentation}`
        ),
      },
      agentContext && {
        role: 'user' as const,
        content: asSystemMessage(agentContext.trim()),
        timeToLive: 'userPrompt',
      },
      hasAssistantMessage && {
        role: 'user' as const,
        content: asSystemInstruction(
          "All <previous_assistant_message>messages</previous_assistant_message> were from some less intelligent assistant. Your task is to identify any mistakes the previous assistant has made or if they have gone off track. Reroute the conversation back toward the user request, correct the previous assistant's mistakes (including errors from the system), identify potential issues in the code, etc.\nSeamlessly continue the conversation as if you are the same assistant, because that is what the user sees. e.g. when correcting the previous assistant, use language as if you were correcting yourself.\nIf you cannot identify any mistakes, that's great! Simply continue the conversation as if you are the same assistant. The user has seen the previous assistant's messages, so do not repeat what was already said."
        ),
        timeToLive: 'userPrompt',
      },
      {
        role: 'user' as const,
        content: asSystemInstruction(userInstructions),
        timeToLive: 'userPrompt',
      },
    ],

    {
      role: 'user',
      content: asSystemMessage(
        `You have ${remainingAssistantMessages + 1} more response(s) before you will be cut off and the turn will be ended automatically.${remainingAssistantMessages === 0 ? ' (This will be the last response.)' : ''}`
      ),
      timeToLive: 'agentStep',
    },

    prompt &&
      cwd && {
        role: 'user' as const,
        content: asSystemMessage(
          `Assistant cwd (project root): ${agentState.fileContext.currentWorkingDirectory}\nUser cwd: ${cwd}`
        ),
        timeToLive: 'agentStep',
      },
    !prompt &&
      toolInstructions && {
        role: 'user' as const,
        content: asSystemInstruction(toolInstructions),
        timeToLive: 'agentStep' as const,
      },

    isAskMode && {
      role: 'user',
      content: asSystemMessage(
        `You have been switched to ASK mode. As such, you can no longer use the write_file tool or run_terminal_command tool. Do not attempt to use them because they will not work!`
      ),
      timeToLive: 'agentStep',
    }
  )

  const iterationNum = messagesWithUserMessage.length

  const system = getAgentSystemPrompt(fileContext, costMode)
  const systemTokens = countTokensJson(system)

  // Possibly truncated messagesWithUserMessage + cache.
  const agentMessages = getCoreMessagesSubset(
    messagesWithUserMessage,
    systemTokens + countTokensJson({ agentContext, userInstructions })
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

  // Think deeply at the start of every response
  if (geminiThinkingEnabled) {
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
      }
    )
    if (model === models.gpt4_1) {
      onResponseChunk('\n')
      response += '\n'
    }
    fullResponse += response
  }

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

  const allToolCalls: ToolCall[] = []
  const clientToolCalls: ClientToolCall[] = []
  const serverToolResults: ToolResult[] = []
  const subgoalToolCalls: Extract<
    ToolCall,
    { name: 'add_subgoal' | 'update_subgoal' }
  >[] = []

  let foundParsingError = false

  function toolCallback<T extends ToolName>(
    tool: T,
    after: (toolCall: Extract<ToolCall, { name: T }>) => void
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
      onTagEnd: async (_: string, parameters: Record<string, string>) => {
        const toolCall = parseRawToolCall({
          name: tool,
          parameters,
        })
        if ('error' in toolCall) {
          serverToolResults.push({
            name: tool,
            id: generateCompactId(),
            result: toolCall.error,
          })
          foundParsingError = true
          return
        }

        // Filter out restricted tools in ask mode unless exporting summary
        if (
          isAskMode &&
          !isExporting &&
          ['write_file', 'str_replace', 'run_terminal_command'].includes(tool)
        ) {
          serverToolResults.push({
            name: tool,
            id: generateCompactId(),
            result: `Tool ${tool} is not available in ask mode. You can only use tools that read information or provide analysis.`,
          })
          return
        }

        allToolCalls.push(toolCall as Extract<ToolCall, { name: T }>)

        after(toolCall as Extract<ToolCall, { name: T }>)
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
        const { thought } = toolCall.parameters
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
              id: generateCompactId(),
            } as ClientToolCall)
          }),
        ])
      ),
      run_terminal_command: toolCallback('run_terminal_command', (toolCall) => {
        const clientToolCall = {
          ...{
            ...toolCall,
            parameters: {
              ...toolCall.parameters,
              mode: 'assistant' as const,
            },
          },
          id: generateCompactId(),
        }
        clientToolCalls.push(clientToolCall)
      }),
      create_plan: toolCallback('create_plan', (toolCall) => {
        const { path, plan } = toolCall.parameters
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
        const { path, content } = toolCall.parameters
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
        const { path, old_vals, new_vals } = toolCall.parameters
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
      research: toolCallback('research', (toolCall) => {
        clientToolCalls.push({
          ...toolCall,
          id: generateCompactId(),
        } as ClientToolCall)
      }),
    },
    (name, error) => {
      foundParsingError = true
      serverToolResults.push({ id: generateCompactId(), name, result: error })
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
    const { name, parameters } = toolCall
    trackEvent(AnalyticsEvent.TOOL_USE, userId ?? '', {
      tool: name,
      parameters,
    })
    if (
      [
        'write_file',
        'str_replace',
        'add_subgoal',
        'update_subgoal',
        'code_search',
        'run_terminal_command',
        'browser_logs',
        'think_deeply',
        'create_plan',
        'research',
        'end_turn',
      ].includes(name)
    ) {
      // Handled above
    } else if (toolCall.name === 'read_files') {
      const paths = (
        toolCall as Extract<ToolCall, { name: 'read_files' }>
      ).parameters.paths
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
          skipRequestingFiles: false,
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
        id: generateCompactId(),
        name: 'read_files',
        result: renderReadFilesResult(
          addedFiles,
          fileContext.tokenCallers ?? {}
        ),
      })
    } else if (toolCall.name === 'find_files') {
      const description = (
        toolCall as Extract<ToolCall, { name: 'find_files' }>
      ).parameters.description
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
        id: generateCompactId(),
        name: 'find_files',
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
    } else if (toolCall.name === 'research') {
      const { prompts } = toolCall.parameters as { prompts: string[] }
      const researchResults = await research(ws, prompts, agentState, {
        userId,
        clientSessionId,
        fingerprintId,
        promptId,
      })

      const formattedResult = researchResults
        .map(
          (result, i) =>
            `<research_result>\n<prompt>${prompts[i]}</prompt>\n<result>${result}</result>\n</research_result>`
        )
        .join('\n\n')

      serverToolResults.push({
        id: generateCompactId(),
        name: 'research',
        result: formattedResult,
      })
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
    serverToolResults.push({
      id: generateCompactId(),
      name: result.tool,
      result: `${result.path}: ${result.error}`,
    })
  }

  if (
    clientToolCalls.every((tool) => tool.name !== 'end_turn') &&
    (agentState.consecutiveAssistantMessages ?? 0) > 2
  ) {
    const isLoop = await checkForUnproductiveLoop(messagesWithResponse, {
      clientSessionId,
      fingerprintId,
      userInputId: promptId,
      userId,
    })
    if (isLoop) {
      logger.warn('Detected unproductive loop, ending turn.')
      onResponseChunk('\n\nHow would you like to proceed from here?\n\n')
      fullResponse += getToolCallString('end_turn', {})
      clientToolCalls.push({
        name: 'end_turn',
        parameters: {},
        id: generateCompactId(),
      })
    }
  }

  if (fileChanges.length === 0 && fileProcessingPromises.length > 0) {
    onResponseChunk('No changes to existing files.\n')
  }
  if (fileChanges.length > 0) {
    onResponseChunk(`\n`)
  }

  // Add successful changes to clientToolCalls
  const changeToolCalls = fileChanges.map(({ path, content, patch, tool }) => ({
    name: tool,
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

  const newAgentState: AgentState = {
    ...agentState,
    messageHistory: finalMessageHistory,
    agentContext: newAgentContext,
    consecutiveAssistantMessages: prompt
      ? 1
      : (agentState.consecutiveAssistantMessages ?? 0) + 1,
    agentStepsRemaining:
      agentState.agentStepsRemaining === undefined
        ? undefined
        : agentState.agentStepsRemaining - 1,
  }

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
