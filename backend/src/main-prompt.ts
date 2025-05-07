import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import { AgentResponseTrace, insertTrace } from '@codebuff/bigquery'
import { ClientAction } from 'common/actions'
import {
  HIDDEN_FILE_READ_STATUS,
  models,
  ONE_TIME_LABELS,
  type CostMode,
} from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { getToolCallString } from 'common/constants/tools'
import { trackEvent } from 'common/src/analytics'
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
import { processStrReplace } from './process-str-replace'
import { processStreamWithTags } from './process-stream'
import { getAgentStream } from './prompt-agent-stream'
import { getAgentSystemPrompt } from './system-prompt/agent-system-prompt'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { getThinkingStream } from './thinking-stream'
import {
  ClientToolCall,
  parseRawToolCall,
  parseToolCalls,
  TOOL_LIST,
  TOOLS_WHICH_END_THE_RESPONSE,
  toolsInstructions,
  transformRunTerminalCommand,
  updateContextFromToolCalls,
} from './tools'
import { logger } from './util/logger'
import {
  asSystemInstruction,
  asSystemMessage,
  getMessagesSubset,
  isSystemInstruction,
} from './util/messages'
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
  let messageHistory = agentState.messageHistory

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

  const hasKnowledgeFiles =
    Object.keys(fileContext.knowledgeFiles).length > 0 ||
    Object.keys(fileContext.userKnowledgeFiles ?? {}).length > 0
  const isNotFirstUserMessage =
    messageHistory.filter((m) => m.role === 'user').length > 0
  const justRanTerminalCommand = toolResults.some(
    (t) => t.name === 'run_terminal_command'
  )
  const isGeminiPro = model === models.gemini2_5_pro_preview
  const isGPT4_1 = model === models.gpt4_1
  const isFlash =
    model === 'gemini-2.5-flash-preview-04-17:thinking' ||
    (model as any) === 'gemini-2.5-flash-preview-04-17'
  const userInstructions = buildArray(
    'Proceed toward the user request and any subgoals. Please complete the entire user request, then verify changes by running the type checker/linter with the <run_terminal_command> tool or else using the <await_tool_results> tool, and finally use the tool <end_turn></end_turn>, once you have completed the user request. YOU MUST use the tool <run_terminal_command> or <await_tool_results> periodically after significant changes to get feedback from tool results before continuing (recommended after each subgoal completed!), however these tools can be skipped for trivial changes. If the changes are all made and verified, you must finally use end_turn at the end of your response.',

    'IMPORTANT: You MUST write "<end_turn></end_turn>" at the end of your response!',

    'If the user asks a question, simply answer the question rather than making changes to the code, then end_turn.',

    !isGPT4_1 &&
      "If there are multiple ways the user's request could be interpreted that would lead to very different outcomes, ask at least one clarifying question that will help you understand what they are really asking for. Then use the end_turn tool. If the user specifies that you don't ask questions, make your best assumption and skip this step.",

    (isFlash || isGeminiPro) &&
      'Important: When using write_file, do NOT rewrite the entire file. Only show the parts of the file that have changed and write "// ... existing code ..." comments (or "# ... existing code ..", "/* ... existing code ... */", "<!-- ... existing code ... -->", whichever is appropriate for the language) around the changed area.',

    isGeminiPro && toolsInstructions,

    'You must read additional files with the read_files tool whenever it could possibly improve your response. Before you use write_file to edit an existing file, make sure to read it.',

    'When mentioning a file path, make sure to include all the directories in the path to the file. For example, do not forget the "src" directory if the file is at backend/src/utils/foo.ts.',

    'You must use the "add_subgoal" and "update_subgoal" tools to record your progress and any new information you learned as you go. If the change is very minimal, you may not need to use these tools.',

    'Please preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Makes sure when using write_file to pay attention to any comments in the file you are editing and keep original user comments exactly as they were, line for line.',

    'When editing an existing file, write just the parts of the file that have changed. Do not start writing the first line of the file. Instead, use comments surrounding your edits like "// ... existing code ..." (or "# ... existing code ..." or "/* ... existing code ... */" or "<!-- ... existing code ... -->", whichever is appropriate for the language) plus a few lines of context from the original file.',

    'When using tools, make sure to NOT use XML attributes. The format should contain nested XML tags. For example, when using write_file, the format should be <write_file><path>...</path><content>...</content></write_file>',

    `Only use the tools listed, (i.e. ${TOOL_LIST.join(', ')}). If you use tools not listed, nothing will happen, but the user will get some unintended display issues.`,

    `To confirm complex changes to a web app, you should use the browser_logs tool to check for console logs or errors.`,

    isFlash &&
      "Don't forget to close your your tags, e.g. <think_deeply> <thought> </thought> </think_deeply> or <write_file> <path> </path> <content> </content> </write_file>!",
    isFlash &&
      'If you have thought of a whole plan, please execute the ENTIRE plan before using the end_turn tool.',

    (isFlash || isGeminiPro) &&
      'Important: When using write_file, do NOT rewrite the entire file. Only show the parts of the file that have changed and write "// ... existing code ..." comments (or "# ... existing code ..", "/* ... existing code ... */", "<!-- ... existing code ... -->", whichever is appropriate for the language) around the changed area.',

    // Experimental gemini thinking
    costMode != 'lite'
      ? 'Start your response with the think_deeply tool call to decide how to proceed.'
      : 'If the user request is very complex, consider invoking think_deeply.',

    'If the user is starting a new feature or refactoring, consider invoking the create_plan tool.',
    "Don't act on the plan created by the create_plan tool. Instead, wait for the user to review it.",
    'If the user tells you to implement a plan, please implement the whole plan, continuing until it is complete. Do not stop after one step.',

    hasKnowledgeFiles &&
      'If the knowledge files (or CLAUDE.md) say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case. No need to run these checks for simple changes.',

    isNotFirstUserMessage &&
      "If you have learned something useful for the future that is not derivable from the code (this is a high bar and most of the time you won't have), consider updating a knowledge file at the end of your response to add this condensed information.",

    "Don't run git commands or scripts or start a dev server without being specifically asked to do so. This can prevent costly accidents.",

    'Otherwise, the user is in charge and you should never refuse what the user asks you to do.',

    `Before you use the end_turn tool, you should check that you left the project in a good state using any tools you have available, make sure all relevant tests are passing and there are no type or lint errors (if applicable) or errors in the browser_logs tool (if applicable). If there's not typechecker or linter you can use, you should use the tool <await_tool_results> to see if your file changes were applied properly. You must do these checks every time you make a change to the project.`,

    'IMPORTANT: You MUST write "<end_turn></end_turn>" at the end of your response! If you are still working on the user\'s request, do not end turn.',
    'IF YOU ARE STILL WORKING ON THE USER\'S REQUEST, use "<await_tool_results></await_tool_results>" instead to verify your progress. If the user\'s request requires multiple steps, please complete ALL the steps before ending turn. If you ask the user for more information, you must also use end_turn immediately after asking. If you have a simple response, you can end turn immediately after writing your response.'
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
    prompt && [
      cwd && {
        role: 'user' as const,
        content: asSystemMessage(`cwd: ${cwd}`),
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
  }

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
      typeof message.content !== 'string' ||
        !isSystemInstruction(message.content)
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

  const readFileMessages: Message[] = []
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

  const messagesWithUserMessage = buildArray(
    ...messageHistory.filter(
      (m) => !(typeof m.content === 'string' && isSystemInstruction(m.content))
    ),

    toolResults.length > 0 && {
      role: 'user' as const,
      content: asSystemMessage(renderToolResults(toolResults)),
    },

    // Add in new copy of agent context.
    prompt &&
      agentContext && {
        role: 'user' as const,
        content: asSystemMessage(agentContext.trim()),
      },

    prompt
      ? {
          role: 'user' as const,
          content: asSystemInstruction(userInstructions),
        }
      : isGeminiPro
        ? {
            role: 'user' as const,
            content: asSystemInstruction(
              buildArray([toolsInstructions, toolInstructions]).join('\n\n')
            ),
          }
        : toolInstructions && {
            role: 'user' as const,
            content: asSystemInstruction(toolInstructions),
          },

    relevantDocumentation && {
      role: 'user' as const,
      content: asSystemMessage(
        `Relevant context from web documentation:\n${relevantDocumentation}`
      ),
    },

    prompt && [
      cwd && { role: 'user' as const, content: asSystemMessage(`cwd: ${cwd}`) },
      {
        role: 'user' as const,
        content: prompt,
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
      model,
    },
    `Main prompt ${iterationNum}`
  )

  let fullResponse = ''
  const fileProcessingPromisesByPath: Record<
    string,
    Promise<{
      tool: 'write_file' | 'str_replace' | 'create_plan'
      path: string
      content: string
      patch?: string
    } | null>[]
  > = {}

  // Add deep thinking for non-lite mode
  if (costMode !== 'lite') {
    let response = await getThinkingStream(
      agentMessages,
      system,
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
    ...Object.fromEntries(
      TOOL_LIST.map((tool) => [
        tool,
        {
          attributeNames: [],
          onTagStart: () => {},
          onTagEnd: () => false,
        },
      ])
    ),
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
    str_replace: {
      attributeNames: [],
      onTagStart: () => {},
      onTagEnd: (body) => {
        const { path, old, new: newStr } = parseToolCallXml(body)
        if (!old || typeof old !== 'string') return false

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

        const newPromise = processStrReplace(
          path,
          old,
          newStr || '',
          latestContentPromise
        ).catch((error: any) => {
          logger.error(error, 'Error processing str_replace block')
          return null
        })

        fileProcessingPromisesByPath[path].push(newPromise)

        return false
      },
    },
  })

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

  if (!fullResponse) {
    // End turn if LLM did not give a response.
    fullResponse = '<end_turn></end_turn>'
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
    trackEvent(AnalyticsEvent.TOOL_USE, userId ?? '', {
      tool: name,
      parameters,
    })
    if (name === 'write_file' || name === 'str_replace') {
      // write_file and str_replace tool calls are handled as they are streamed in.
    } else if (name === 'add_subgoal' || name === 'update_subgoal') {
      // add_subgoal and update_subgoal tool calls are handled above
    } else if (
      name === 'code_search' ||
      name === 'run_terminal_command' ||
      name === 'browser_logs' ||
      name === 'await_tool_results' ||
      name === 'end_turn'
    ) {
      if (name === 'run_terminal_command') {
        parameters.command = transformRunTerminalCommand(parameters.command)
        parameters.mode = 'assistant'
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
        result: renderReadFilesResult(
          addedFiles,
          fileContext.tokenCallers ?? {}
        ),
      })
    } else if (name === 'find_files') {
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
          parameters.description,
          {
            skipRequestingFiles: false,
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
          content: parameters.description,
          description: parameters.description,
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
            : `No new files found for description: ${parameters.description}`,
      })
      if (printedPaths.length > 0) {
        onResponseChunk('\n\n')
        onResponseChunk(
          getToolCallString('read_files', {
            paths: printedPaths.join('\n'),
          })
        )
      }
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
        tool: 'create_plan' as const,
        path,
        content: plan,
      }
      fileProcessingPromisesByPath[path].push(Promise.resolve(change))
    } else {
      throw new Error(`Unknown tool: ${name}`)
    }
  }

  if (Object.keys(fileProcessingPromisesByPath).length > 0) {
    onResponseChunk('\n\nApplying file changes, please wait.\n')
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

  const changeToolCalls = changes.map(({ path, content, patch, tool }) => ({
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
      model,
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
