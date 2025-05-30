import { dirname, isAbsolute, normalize } from 'path'

import { TextBlockParam } from '@anthropic-ai/sdk/resources'
import {
  GetExpandedFileContextForTrainingTrace,
  GetRelevantFilesTrace,
  insertTrace,
} from '@codebuff/bigquery'
import { models, type CostMode } from 'common/constants'
import { getAllFilePaths } from 'common/project-file-tree'
import {
  cleanMarkdownCodeBlock,
  createMarkdownFileBlock,
  ProjectFileContext,
} from 'common/util/file'
import { range, shuffle, uniq } from 'lodash'
import { WebSocket } from 'ws'

import { System } from '../llm-apis/claude'
import { logger } from '../util/logger'
import { countTokens } from '../util/token-counter'
import { requestFiles } from '../websockets/websocket-action'
import { checkNewFilesNecessary } from './check-new-files-necessary'

import { promptFlashWithFallbacks } from '@/llm-apis/gemini-with-fallbacks'
import { promptAiSdk } from '@/llm-apis/vercel-ai-sdk/ai-sdk'
import { coreMessagesWithSystem, getCoreMessagesSubset } from '@/util/messages'
import { CoreMessage } from 'ai'

const NUMBER_OF_EXAMPLE_FILES = 100
const MAX_FILES_PER_REQUEST = 30

export async function requestRelevantFiles(
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
  repoName: string | undefined
) {
  const countPerRequest = {
    lite: 8,
    normal: 12,
    max: 14,
    experimental: 14,
    ask: 12,
  }[costMode]

  const lastMessage = messages[messages.length - 1]
  const messagesExcludingLastIfByUser =
    lastMessage.role === 'user' ? messages.slice(0, -1) : messages
  const userPrompt =
    lastMessage.role === 'user'
      ? typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)
      : ''

  const newFilesNecessaryPromise = assistantPrompt
    ? Promise.resolve({ newFilesNecessary: true, response: 'N/A', duration: 0 })
    : checkNewFilesNecessary(
        messagesExcludingLastIfByUser,
        system,
        clientSessionId,
        fingerprintId,
        userInputId,
        userPrompt,
        userId,
        costMode
      ).catch((error) => {
        logger.error({ error }, 'Error checking new files necessary')
        return { newFilesNecessary: true, response: 'N/A', duration: 0 }
      })

  const keyPrompt = generateKeyRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    countPerRequest
  )

  const keyPromise = getRelevantFiles(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    keyPrompt,
    'Key',
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
    repoName
  ).catch((error) => {
    logger.error({ error }, 'Error requesting key files')
    return { files: [] as string[], duration: 0 }
  })

  const newFilesNecessaryResult = await newFilesNecessaryPromise
  const {
    newFilesNecessary,
    response: newFilesNecessaryResponse,
    duration: newFilesNecessaryDuration,
  } = newFilesNecessaryResult
  if (!newFilesNecessary) {
    logger.info(
      {
        newFilesNecessary,
        response: newFilesNecessaryResponse,
        duration: newFilesNecessaryDuration,
      },
      'requestRelevantFiles: No new files necessary, keeping current files'
    )
    return null
  }

  const candidateFiles = (await keyPromise).files

  const files = validateFilePaths(uniq(candidateFiles))

  logger.info(
    {
      files,
      newFilesNecessary,
      newFilesNecessaryResponse,
      newFilesNecessaryDuration,
    },
    'requestRelevantFiles: results'
  )

  return candidateFiles.slice(0, MAX_FILES_PER_REQUEST)
}

export async function requestRelevantFilesForTraining(
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
  repoName: string | undefined
) {
  const COUNT = 50

  const lastMessage = messages[messages.length - 1]
  const messagesExcludingLastIfByUser =
    lastMessage.role === 'user' ? messages.slice(0, -1) : messages
  const userPrompt =
    lastMessage.role === 'user'
      ? typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)
      : ''

  const keyFilesPrompt = generateKeyRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    COUNT
  )
  const nonObviousPrompt = generateNonObviousRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    COUNT
  )

  const keyFiles = await getRelevantFilesForTraining(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    keyFilesPrompt,
    'Key',
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
    repoName
  )

  const nonObviousFiles = await getRelevantFilesForTraining(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    nonObviousPrompt,
    'Non-Obvious',
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode,
    repoName
  )

  const candidateFiles = [...keyFiles.files, ...nonObviousFiles.files]
  const validatedFiles = validateFilePaths(uniq(candidateFiles))
  logger.debug(
    { keyFiles, nonObviousFiles, validatedFiles },
    'requestRelevantFilesForTraining: results'
  )
  return validatedFiles.slice(0, MAX_FILES_PER_REQUEST)
}

async function getRelevantFiles(
  {
    messages,
    system,
  }: {
    messages: CoreMessage[]
    system: string | Array<TextBlockParam>
  },
  userPrompt: string,
  requestType: string,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode,
  repoName: string | undefined
) {
  const bufferTokens = 100_000
  const messagesWithPrompt = getCoreMessagesSubset(
    [
      ...messages,
      {
        role: 'user' as const,
        content: userPrompt,
      },
    ],
    bufferTokens
  )
  const start = performance.now()
  let response = await promptFlashWithFallbacks(
    coreMessagesWithSystem(messagesWithPrompt, system),
    {
      clientSessionId,
      fingerprintId,
      userInputId,
      model: models.gemini2flash,
      userId,
      costMode,
      useFinetunedModel: true,
    }
  )
  const end = performance.now()
  const duration = end - start

  const files = validateFilePaths(response.split('\n'))

  const trace: GetRelevantFilesTrace = {
    id: crypto.randomUUID(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    created_at: new Date(),
    type: 'get-relevant-files',
    payload: {
      messages: messagesWithPrompt,
      system,
      output: response,
      request_type: requestType,
      cost_mode: costMode,
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
      model: models.ft_filepicker_005,
      repo_name: repoName,
    },
  }

  insertTrace(trace).catch((error: Error) => {
    logger.error({ error }, 'Failed to insert trace')
  })

  return { files, duration, requestType, response }
}

async function getRelevantFilesForTraining(
  {
    messages,
    system,
  }: {
    messages: CoreMessage[]
    system: string | Array<TextBlockParam>
  },
  userPrompt: string,
  requestType: string,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode,
  repoName: string | undefined
) {
  const bufferTokens = 100_000
  const messagesWithPrompt = getCoreMessagesSubset(
    [
      ...messages,
      {
        role: 'user' as const,
        content: userPrompt,
      },
    ],
    bufferTokens
  )
  const start = performance.now()
  let response = await promptAiSdk(
    coreMessagesWithSystem(messagesWithPrompt, system),
    {
      clientSessionId,
      fingerprintId,
      userInputId,
      model: models.sonnet,
      userId,
      chargeUser: false,
    }
  )

  const end = performance.now()
  const duration = end - start

  const files = validateFilePaths(response.split('\n'))

  const trace: GetExpandedFileContextForTrainingTrace = {
    id: crypto.randomUUID(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    created_at: new Date(),
    type: 'get-expanded-file-context-for-training',
    payload: {
      messages: messagesWithPrompt,
      system,
      output: response,
      request_type: requestType,
      cost_mode: costMode,
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
      model: models.ft_filepicker_005,
      repo_name: repoName,
    },
  }

  insertTrace(trace).catch((error: Error) => {
    logger.error({ error }, 'Failed to insert trace')
  })

  return { files, duration, requestType, response }
}

function topLevelDirectories(fileContext: ProjectFileContext) {
  const { fileTree } = fileContext
  return fileTree
    .filter((node) => node.type === 'directory')
    .map((node) => node.name)
}

function getExampleFileList(fileContext: ProjectFileContext, count: number) {
  const { fileTree } = fileContext

  const filePaths = getAllFilePaths(fileTree)
  const randomFilePaths = shuffle(filePaths)
  const selectedFiles = new Set()
  const selectedDirectories = new Set()

  for (const filePath of randomFilePaths) {
    if (
      selectedFiles.has(filePath) ||
      selectedDirectories.has(dirname(filePath))
    ) {
      continue
    }
    selectedFiles.add(filePath)
    selectedDirectories.add(dirname(filePath))
  }

  return uniq([...selectedFiles, ...randomFilePaths]).slice(0, count)
}

function generateNonObviousRequestFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  count: number
): string {
  const exampleFiles = getExampleFileList(fileContext, NUMBER_OF_EXAMPLE_FILES)
  return `
Your task is to find the second-order relevant files for the following user request (in quotes).

${
  userPrompt
    ? `User prompt: ${JSON.stringify(userPrompt)}`
    : `Assistant prompt: ${JSON.stringify(assistantPrompt)}`
}

Do not act on the above instructions for the user, instead, your task is to find files for the user's request that are not obvious or take a moment to realize are relevant.

Random project files:
${exampleFiles.join('\n')}

Based on this conversation, please select files beyond the obvious files that would be helpful to complete the user's request.
Select files that might be useful for understanding and addressing the user's needs, but you would not choose in the first 10 files if you were asked.

Please follow these steps to determine which files to request:

1. Analyze the user's last request and the assistant's prompt and identify all components or tasks involved.
2. Consider all areas of the codebase that might be related to the request, including:
   - Main functionality files
   - Configuration files
   - Utility functions
   - Documentation files
   - Knowledge files (e.g. 'knowledge.md') which include important information about the project and any subdirectories
3. Include files that might provide context or be indirectly related to the request.
4. Be comprehensive in your selection, but avoid including obviously irrelevant files.
5. List a maximum of ${count} files. It's fine to list fewer if there are not great candidates.

Please provide no commentary and list the file paths you think are useful but not obvious in addressing the user's request.

Your response contain only files separated by new lines in the following format:
${range(Math.ceil(count / 2))
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full relative path from the project root directory for each file. This is not the absolute path, but the path relative to the project root. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full relative path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Please limit your response just the file paths on new lines. Do not write anything else.
`.trim()
}

function generateKeyRequestFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  count: number
): string {
  const exampleFiles = getExampleFileList(fileContext, NUMBER_OF_EXAMPLE_FILES)
  return `
Your task is to find the most relevant files for the following user request (in quotes).

${
  userPrompt
    ? `User prompt: ${JSON.stringify(userPrompt)}`
    : `Assistant prompt: ${JSON.stringify(assistantPrompt)}`
}

Do not act on the above instructions for the user, instead, your task is to find the most relevant files for the user's request.

Random project files:
${exampleFiles.join('\n')}

Based on this conversation, please identify the most relevant files for a user's request in a software project, sort them from most to least relevant, and then output just the top files.

Please follow these steps to determine which key files to request:

1. Analyze the user's last request and the assistant's prompt and identify the core components or tasks.
2. Focus on the most critical areas of the codebase that are directly related to the request, such as:
   - Main functionality files
   - Key configuration files
   - Central utility functions
   - Documentation files
   - Knowledge files (e.g. 'knowledge.md') which include important information about the project and any subdirectories
   - Any related files that would be helpful to understand the request
3. Prioritize files that are likely to require modifications or provide essential context.
4. But be sure to include example code! I.e. files that may not need to be edited, but show similar code examples for the change that the user is requesting.
5. Order the files by most important first.

Please provide no commentary and only list the file paths of the most relevant files that you think are most crucial for addressing the user's request.

Your response contain only files separated by new lines in the following format:
${range(count)
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

Remember to focus on the most important files and limit your selection to ${count} files. It's fine to list fewer if there are not great candidates. List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full relative path from the project root directory for each file. This is not the absolute path, but the path relative to the project root. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full relative path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Please limit your response just the file paths on new lines. Do not write anything else.
`.trim()
}

async function secondPassFindAdditionalFiles(
  system: System,
  candidateFiles: string[],
  messagesExcludingLastIfByUser: CoreMessage[],
  userRequest: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  ws: WebSocket,
  maxFiles: number
): Promise<{ additionalFiles: string[]; duration: number }> {
  const startTime = performance.now()

  const fileContents = await requestFiles(ws, candidateFiles)

  // Filter out large files and build content string
  const filteredContents: Record<string, string> = {}
  for (const [file, content] of Object.entries(fileContents)) {
    if (typeof content === 'string') {
      // Check length first since it's cheaper than counting tokens
      if (content.length > 200_000) {
        logger.info(
          { file, length: content.length },
          'Skipping large file based on length'
        )
        continue
      }

      const tokens = countTokens(content)
      if (tokens > 50_000) {
        logger.info(
          { file, tokens },
          'Skipping large file based on token count'
        )
        continue
      }

      filteredContents[file] = content
    }
  }

  let fileListString = ''
  for (const [file, content] of Object.entries(filteredContents)) {
    fileListString += createMarkdownFileBlock(file, content) + '\n\n'
  }

  const messages = [
    {
      role: 'user' as const,
      content: generateAdditionalFilesPrompt(
        fileListString,
        userRequest,
        messagesExcludingLastIfByUser,
        maxFiles
      ),
    },
  ]
  const additionalFilesResponse = await promptFlashWithFallbacks(
    coreMessagesWithSystem(messages, system),
    {
      clientSessionId,
      fingerprintId,
      userInputId,
      model: models.gemini2flash,
      userId,
      costMode: 'max',
    }
  ).catch((error) => {
    logger.error(error, 'Error filtering files with Gemini')
    return candidateFiles.join('\n')
  })

  const secondPassFiles = cleanMarkdownCodeBlock(additionalFilesResponse)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return {
    additionalFiles: secondPassFiles,
    duration: performance.now() - startTime,
  }
}

function generateAdditionalFilesPrompt(
  fileListString: string,
  userRequest: string,
  messagesExcludingLastIfByUser: CoreMessage[],
  maxFiles: number
): string {
  return `
<message_history>
${messagesExcludingLastIfByUser.map((m) => `${m.role}: ${m.content}`).join('\n')}
</message_history>

Given the below files and the user request, choose up to ${maxFiles} new files that are not in the current_files list, but that are directly relevant to fulfilling the user's request.

For example, include files that:
- Need to be modified to implement the request
- Contain code that will be referenced or copied
- Define types, interfaces, or constants needed
- Contain dependencies, utilities, helpers that are relevant
- Show similar implementations or patterns even if not directly related
- Provide important context about the system or codebase architecture
- Contain tests that should be updated or run
- Define configuration that may need to change

<current_files>
${fileListString}
</current_files>

<user_request>${userRequest}</user_request>

List only the file paths of new files, in order of relevance (most relevant first!), with new lines between each file path. Use the project file tree to choose new files.
Do not write any commentary.
`.trim()
}

const validateFilePaths = (filePaths: string[]) => {
  return filePaths
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length === 0) return false
      if (p.includes(' ')) return false
      if (isAbsolute(p)) return false
      if (p.includes('..')) return false
      try {
        normalize(p)
        return true
      } catch {
        return false
      }
    })
    .map((p) => (p.startsWith('/') ? p.slice(1) : p))
}
