import { WebSocket } from 'ws'
import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import { AnthropicModel } from 'common/constants'
import { promptClaudeStream } from './llm-apis/claude'
import { parseToolCallXml } from './util/parse-tool-call-xml'
import { getModelForMode } from 'common/constants'
import { ProjectFileContext } from 'common/util/file'
import { getSearchSystemPrompt } from './system-prompt/search-system-prompt'
import { Message } from 'common/types/message'
import { ClientAction, FileChange } from 'common/actions'
import { type CostMode } from 'common/constants'
import { requestFiles } from './websockets/websocket-action'
import { processFileBlock } from './process-file-block'
import { requestRelevantFiles } from './find-files/request-files-prompt'
import { processStreamWithTags } from './process-stream'
import { countTokens, countTokensJson } from './util/token-counter'
import { logger } from './util/logger'
import { difference, uniq, zip } from 'lodash'
import { buildArray } from 'common/util/array'
import {
  getRelevantFilesForPlanning,
  loadFilesForPlanning,
  planComplexChange,
} from './planning'
import { getAgentSystemPrompt } from './system-prompt/agent-system-prompt'
import {
  ClientToolCall,
  parseToolCalls,
  TOOL_LIST,
  updateContextFromToolCalls,
} from './tools'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { generateCompactId } from 'common/util/string'

export const mainPrompt = async (
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void
) => {
  const { prompt, agentState, fingerprintId, costMode, promptId, toolResults } =
    action
  const { messageHistory, fileContext } = agentState

  const messagesWithUserMessage = prompt
    ? [
        ...messageHistory,
        {
          role: 'user' as const,
          content: prompt,
        },
      ]
    : messageHistory
  const lastUserMessage = messagesWithUserMessage.findLast(
    (m) => m.role === 'user'
  )
  const lastAssistantMessage = messagesWithUserMessage.findLast(
    (m) => m.role === 'assistant'
  )
  if (typeof lastAssistantMessage?.content === 'string') {
    lastAssistantMessage.content = lastAssistantMessage.content.trim()
  }

  const iterationNum = messagesWithUserMessage.length

  let fullResponse = ''
  const fileProcessingPromises: Promise<FileChange | null>[] = []

  const justUsedATool = toolResults.length > 0
  const allMessagesTokens = countTokensJson(messagesWithUserMessage)

  // Step 1: Read more files.
  const searchSystem = getSearchSystemPrompt(
    fileContext,
    costMode,
    allMessagesTokens
  )
  const messagesWithOptionalReadFiles = [...messagesWithUserMessage]
  const { newFileVersions, readFilesMessage, existingNewFilePaths } =
    await getFileVersionUpdates(
      ws,
      messagesWithUserMessage,
      searchSystem,
      fileContext,
      null,
      {
        skipRequestingFiles: justUsedATool,
        clientSessionId,
        fingerprintId,
        userInputId: promptId,
        userId,
        costMode,
      }
    )
  fileContext.fileVersions = newFileVersions
  if (readFilesMessage !== undefined) {
    onResponseChunk(`${readFilesMessage}\n\n`)

    if (existingNewFilePaths?.length) {
      messagesWithOptionalReadFiles.push({
        role: 'assistant' as const,
        content: `<read_files>
<paths>
${existingNewFilePaths.join('\n')}
</paths>
</read_files>`,
      })
    }

    toolResults.push({
      id: generateCompactId(),
      name: 'read_files',
      result: `Read the following files: ${(existingNewFilePaths ?? ['None']).join('\n')}`,
    })
  }

  const { agentContext } = agentState
  const hasKnowledgeFiles =
    Object.keys(fileContext.knowledgeFiles).length > 0 ||
    Object.keys(fileContext.userKnowledgeFiles ?? {}).length > 0
  const isNotFirstUserMessage =
    messagesWithUserMessage.filter((m) => m.role === 'user').length > 1

  const userInstructions = buildArray(
    'Instructions:',
    'Proceed toward the user request and any subgoals.',

    'Please preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Then pause to get more instructions from the user.',

    'You may use the "add_subgoal" and "update_subgoal" tools to record your progress and any new information you learned as you go. If the change is minimal, you may not need to use these tools.',

    // !justUsedATool &&
    //   !recentlyDidThinking &&
    //   'If the user request is very complex (e.g. requires changes across multiple files or systems) and you have not recently used the think_deeply tool, consider invoking the think_deeply tool, although this should be used sparingly.',

    hasKnowledgeFiles &&
      'If the knowledge files say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case.',

    hasKnowledgeFiles &&
      isNotFirstUserMessage &&
      "If you have learned something useful for the future that is not derrivable from the code (this is a high bar and most of the time you won't have), consider updating a knowledge file at the end of your response to add this condensed information.",

    justUsedATool &&
      `If the tool result above is of a terminal command succeeding and you have completed the user's request, please use the end_turn tool and do not write anything else.`,

    'Write "<end_turn></end_turn>" at the end of your response, but only once you are confident the user request has been accomplished or you need more information from the user.'
  ).join('\n')

  const agentMessages = buildArray(
    agentContext && {
      role: 'assistant' as const,
      content: agentContext,
    },
    {
      role: 'user' as const,
      content: userInstructions,
    },
    ...getMessagesSubset(messagesWithOptionalReadFiles),
    toolResults.length > 0 && {
      role: 'user' as const,
      content: `
<tool_results>
${toolResults
  .map(
    (result) => `<tool_result>
<tool>${result.name}</tool>
<result>${result.result}</result>
</tool_result>`
  )
  .join('\n')}
</tool_results>
`.trim(),
    }
  )
  const agentMessagesTokens = countTokensJson(agentMessages)
  const system = getAgentSystemPrompt(
    fileContext,
    agentMessages,
    agentMessagesTokens
  )

  logger.debug(
    {
      agentMessages,
      prompt,
      agentContext,
      files: fileContext.fileVersions.map((files) => files.map((f) => f.path)),
      iteration: iterationNum,
      toolResults,
    },
    `Main prompt ${iterationNum}`
  )

  const stream = promptClaudeStream(agentMessages, {
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

        const fileContentWithoutStartNewline = content.startsWith('\n')
          ? content.slice(1)
          : content

        fileProcessingPromises.push(
          processFileBlock(
            path,
            fileContentWithoutStartNewline,
            messagesWithOptionalReadFiles,
            fullResponse,
            prompt,
            clientSessionId,
            fingerprintId,
            promptId,
            userId,
            ws,
            costMode
          ).catch((error) => {
            logger.error(error, 'Error processing file block')
            return null
          })
        )
        fullResponse += body
        return false
      },
    },
    ...Object.fromEntries(
      TOOL_LIST.filter((tool) => tool !== 'write_file').map((tool) => [
        tool,
        {
          attributeNames: [],
          onTagStart: () => {},
          onTagEnd: (body) => {
            fullResponse += body
            return false
          },
        },
      ])
    ),
  })

  for await (const chunk of streamWithTags) {
    fullResponse += chunk
    onResponseChunk(chunk)
  }

  const messagesWithResponse = [
    ...messagesWithOptionalReadFiles,
    { role: 'assistant' as const, content: fullResponse || "I'll continue." },
  ]
  const toolCalls = parseToolCalls(fullResponse)
  const clientToolCalls: ClientToolCall[] = []
  const serverToolResults: ToolResult[] = []

  const agentContextPromise =
    toolCalls.length > 0
      ? updateContextFromToolCalls(agentContext, toolCalls)
      : Promise.resolve(agentContext)

  for (const toolCall of toolCalls) {
    const { name, parameters } = toolCall
    if (name === 'write_file') {
      // write_file tool calls are handled as they are streamed in.
    } else if (name === 'add_subgoal' || name === 'update_subgoal') {
      // add_subgoal and update_subgoal tool calls are handled above
    } else if (
      // name === 'code_search' ||
      name === 'run_terminal_command' ||
      name === 'end_turn'
    ) {
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
      const existingPaths = fileContext.fileVersions.flatMap((files) =>
        files.map((file) => file.path)
      )
      const newPaths = difference(paths, existingPaths)
      logger.debug(
        {
          content: parameters.paths,
          existingPaths,
          paths,
          newPaths,
        },
        'read_files tool call'
      )

      const { newFileVersions, existingNewFilePaths } =
        await getFileVersionUpdates(
          ws,
          messagesWithResponse,
          getSearchSystemPrompt(fileContext, costMode, allMessagesTokens),
          fileContext,
          null,
          {
            skipRequestingFiles: false,
            requestedFiles: newPaths,
            clientSessionId,
            fingerprintId,
            userInputId: promptId,
            userId,
            costMode,
          }
        )
      fileContext.fileVersions = newFileVersions
      const didNotExistOrAreHidden = difference(
        newPaths,
        existingNewFilePaths ?? []
      )
      serverToolResults.push({
        id: generateCompactId(),
        name: 'read_files',
        result: `Read the following files: ${parameters.paths}. ${didNotExistOrAreHidden.length > 0 ? `The following files did not exist or were hidden: ${didNotExistOrAreHidden.join('\n')}` : ''}`,
      })
      // } else if (name === 'find_files') {
      //   const { description } = parameters
      //   const { newFileVersions, readFilesMessage, existingNewFilePaths } =
      //     await getFileVersionUpdates(
      //       ws,
      //       messagesWithResponse,
      //       getSearchSystemPrompt(fileContext, costMode, allMessagesTokens),
      //       fileContext,
      //       description,
      //       {
      //         skipRequestingFiles: false,
      //         clientSessionId,
      //         fingerprintId,
      //         userInputId: promptId,
      //         userId,
      //         costMode,
      //       }
      //     )
      //   fileContext.fileVersions = newFileVersions
      //   if (readFilesMessage !== undefined) {
      //     onResponseChunk(`\n${readFilesMessage}`)
      //   }
      //   serverToolResults.push({
      //     id: generateCompactId(),
      //     name: 'find_files',
      //     result: `For the following request "${description}", the following files were found: ${existingNewFilePaths?.join('\n') ?? 'None'}`,
      //   })
    } else if (name === 'think_deeply') {
      const fetchFilesStart = Date.now()
      // assistant sets the prompt, get from parameters
      const filePaths = await getRelevantFilesForPlanning(
        messagesWithResponse,
        // TODO: Ask assistant to come up with a prompt.
        prompt ?? '',
        fileContext,
        costMode,
        clientSessionId,
        fingerprintId,
        promptId,
        userId
      )
      const fetchFilesDuration = Date.now() - fetchFilesStart
      logger.debug(
        { prompt, filePaths, fetchFilesDuration },
        'Got file paths for thinking deeply'
      )
      const fileContents = await loadFilesForPlanning(ws, filePaths)
      const existingFilePaths = Object.keys(fileContents)

      onResponseChunk(
        `\nConsidering the following relevant files:\n${existingFilePaths.join('\n')}\n`
      )
      fullResponse += `\nConsidering the following relevant files:\n${existingFilePaths.join('\n')}\n`
      onResponseChunk(`\nThinking deeply (can take a minute!)`)

      logger.debug({ prompt, filePaths, existingFilePaths }, 'Thinking deeply')
      const planningStart = Date.now()

      const { response, fileProcessingPromises: promises } =
        await planComplexChange(
          fileContents,
          messagesWithResponse,
          prompt ?? '',
          ws,
          {
            clientSessionId,
            fingerprintId,
            userInputId: promptId,
            userId,
            costMode,
          }
        )
      fileProcessingPromises.push(...promises)
      // For now, don't print the plan to the user.
      // onResponseChunk(`${response}\n\n`)
      fullResponse += response + '\n\n'
      logger.debug(
        {
          prompt,
          file_paths: filePaths,
          response,
          fetchFilesDuration,
          planDuration: Date.now() - planningStart,
        },
        'Generated plan'
      )
      serverToolResults.push({
        id: generateCompactId(),
        name: 'think_deeply',
        result: `Read the following files: ${filePaths.join('\n')}, thought deeply about the user request, and generated the following plan: ${response}`,
      })
    } else {
      throw new Error(`Unknown tool: ${name}`)
    }
  }

  if (fileProcessingPromises.length > 0) {
    onResponseChunk('\nApplying file changes, please wait.\n')
  }

  const changes = (await Promise.all(fileProcessingPromises)).filter(
    (change) => change !== null
  )
  if (changes.length === 0 && fileProcessingPromises.length > 0) {
    onResponseChunk('No changes to existing files.\n')
  } else if (fileProcessingPromises.length > 0) {
    onResponseChunk(`\n`)
  }

  for (const change of changes) {
    clientToolCalls.push({
      name: 'write_file',
      parameters: change,
      id: generateCompactId(),
    })
  }

  const newAgentContext = await agentContextPromise
  logger.debug(
    {
      agentContext: newAgentContext,
      previousAgentContext: agentContext,
    },
    'Updated agent context'
  )

  const newAgentState: AgentState = {
    ...agentState,
    messageHistory: messagesWithResponse,
    agentContext: newAgentContext,
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
    },
    `Main prompt response ${iterationNum}`
  )
  return {
    agentState: newAgentState,
    toolCalls: clientToolCalls,
    toolResults: serverToolResults,
    messageHistory: messagesWithResponse,
  }
}

const getInitialFiles = (fileContext: ProjectFileContext) => {
  const { knowledgeFiles } = fileContext
  return (
    Object.entries(knowledgeFiles)
      .map(([path, content]) => ({
        path,
        content,
      }))
      // Only keep main knowledge file.
      .filter(({ path }) => path === 'knowledge.md')
  )
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
  return {
    readFilesMessage: filePaths.length === 0 ? '' : readFilesMessage,
  }
}

async function getFileVersionUpdates(
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
  const {
    skipRequestingFiles,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
  } = options
  const FILE_TOKEN_BUDGET = 100_000 // costMode === 'lite' ? 25_000 :

  const { fileVersions } = fileContext
  const files = fileVersions.flatMap((files) => files)
  const previousFilePaths = uniq(files.map(({ path }) => path))
  const latestFileVersions = previousFilePaths.map((path) => {
    return files.findLast((file) => file.path === path)!
  })
  const previousFiles: Record<string, string> = Object.fromEntries(
    zip(
      previousFilePaths,
      latestFileVersions.map((file) => file.content)
    )
  )
  const editedFilePaths = messages
    .map((m) => m.content)
    .filter(
      (content) =>
        typeof content === 'string' && content.includes('<write_file')
    )
    .map(
      (content) =>
        (content as string).match(/<write_file\s+path="([^"]+)">/)?.[1]
    )
    .filter((path): path is string => path !== undefined)

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

  const initialFiles = getInitialFiles(fileContext)
  const includedInitialFiles =
    files.length === 0 ? initialFiles.map(({ path }) => path) : []

  const allFilePaths = uniq([
    ...requestedFiles,
    ...editedFilePaths,
    ...includedInitialFiles,
    ...previousFilePaths,
  ])
  const loadedFiles = await requestFiles(ws, allFilePaths)

  const filteredRequestedFiles = requestedFiles.filter((filePath, i) => {
    const content = loadedFiles[filePath]
    if (content === undefined) return false
    if (content === null) return true
    const tokenCount = countTokens(content)
    if (i < 5) {
      return tokenCount < 50_000 - i * 10_000
    }
    return tokenCount < 10_000
  })
  const newFiles = difference(filteredRequestedFiles, previousFilePaths)

  const updatedFiles = [...previousFilePaths, ...editedFilePaths].filter(
    (path) => {
      return loadedFiles[path] !== previousFiles[path]
    }
  )

  const addedFiles = uniq([
    ...updatedFiles,
    ...newFiles,
    ...includedInitialFiles,
  ])
    .map((path) => {
      return {
        path,
        content: loadedFiles[path]!,
      }
    })
    .filter((file) => file.content !== null)

  const fileVersionTokens = countTokensJson(files)
  const addedFileTokens = countTokensJson(addedFiles)

  if (fileVersionTokens + addedFileTokens > FILE_TOKEN_BUDGET) {
    const requestedLoadedFiles = filteredRequestedFiles
      .map((path) => ({
        path,
        content: loadedFiles[path]!,
      }))
      .filter((file) => file.content !== null)

    const files = [...initialFiles, ...requestedLoadedFiles]
    while (countTokensJson(files) > FILE_TOKEN_BUDGET) {
      files.pop()
    }

    const readFilesPaths = files
      .filter((f) => f.content !== null)
      .map((f) => f.path)

    const { readFilesMessage } = getRelevantFileInfoMessage(
      readFilesPaths,
      true
    )

    const newFileVersions = [files]

    logger.debug(
      {
        newFileVersions: newFileVersions.map((files) =>
          files.map((f) => f.path)
        ),
        prevFileVersionTokens: fileVersionTokens,
        addedFileTokens,
        beforeTotalTokens: fileVersionTokens + addedFileTokens,
        newFileVersionTokens: countTokensJson(newFileVersions),
        FILE_TOKEN_BUDGET,
      },
      'resetting file versions b/c of token budget'
    )

    return {
      newFileVersions,
      addedFiles,
      clearFileVersions: true,
      readFilesMessage,
    }
  }

  const newFileVersions = [...fileVersions, addedFiles].filter(
    (files) => files.length > 0
  )
  if (newFiles.length === 0) {
    return {
      newFileVersions,
      addedFiles,
      readFilesMessage: undefined,
      toolCallMessage: undefined,
    }
  }

  const isFirstRead = fileVersions.length <= 1
  const existingNewFilePaths = [
    ...newFiles.filter(
      (path) => loadedFiles[path] && loadedFiles.content !== null
    ),
    ...(isFirstRead ? includedInitialFiles : []),
  ]
  const { readFilesMessage } = getRelevantFileInfoMessage(
    existingNewFilePaths,
    isFirstRead
  )

  return {
    newFileVersions,
    addedFiles,
    readFilesMessage,
    existingNewFilePaths,
  }
}

const getMessagesSubset = (messages: Message[]) => {
  const indexLastSubgoalComplete = messages.findLastIndex(({ content }) => {
    JSON.stringify(content).includes('COMPLETE')
  })
  if (indexLastSubgoalComplete === -1) {
    return messages
  }
  return messages.slice(indexLastSubgoalComplete)
}
