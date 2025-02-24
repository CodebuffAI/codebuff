import { WebSocket } from 'ws'
import { range, shuffle, uniq } from 'lodash'
import { dirname, isAbsolute, normalize } from 'path'
import { TextBlockParam } from '@anthropic-ai/sdk/resources'

import { Message } from 'common/types/message'
import {
  ProjectFileContext,
  cleanMarkdownCodeBlock,
  createMarkdownFileBlock,
} from 'common/util/file'
import { System } from '../claude'
import { type CostMode } from 'common/constants'
import { models } from 'common/constants'
import { getAllFilePaths } from 'common/project-file-tree'
import { logger } from '../util/logger'
import { requestFiles } from '../websockets/websocket-action'
import { countTokens } from '../util/token-counter'
import { checkNewFilesNecessary } from './check-new-files-necessary'
import { filterDefined } from 'common/util/array'
import { promptGeminiWithFallbacks } from '@/gemini-with-fallbacks'

const NUMBER_OF_EXAMPLE_FILES = 100

export async function requestRelevantFiles(
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlockParam>
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode
) {
  const { fileVersions } = fileContext
  const previousFiles = uniq(
    fileVersions.flatMap((files) => files.map(({ path }) => path))
  )
  const countPerRequest =
    costMode === 'lite' ? 8 : costMode === 'normal' ? 12 : 14

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
        previousFiles,
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
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    costMode
  ).catch((error) => {
    logger.error({ error }, 'Error requesting key files')
    return { files: [], duration: 0 }
  })

  let nonObviousPromise:
    | Promise<{ files: string[]; duration: number }>
    | undefined
  if (costMode === 'max') {
    const nonObviousPrompt = generateNonObviousRequestFilesPrompt(
      userPrompt,
      assistantPrompt,
      fileContext,
      countPerRequest
    )

    nonObviousPromise = getRelevantFiles(
      {
        messages: messagesExcludingLastIfByUser,
        system,
      },
      nonObviousPrompt,
      'Non-Obvious',
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode
    )
  }

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
        previousFiles,
      },
      'requestRelevantFiles: No new files necessary, keeping current files'
    )
    return null
  }

  const results = filterDefined(
    await Promise.all([keyPromise, nonObviousPromise])
  )
  const candidateFiles = results.flatMap((result) => result.files)

  const firstPassFiles = validateFilePaths(uniq(candidateFiles))

  logger.info(
    {
      previousFiles,
      files: firstPassFiles,
      firstPassResults: results,
      newFilesNecessary,
      newFilesNecessaryResponse,
      newFilesNecessaryDuration,
    },
    'requestRelevantFiles: results'
  )

  return firstPassFiles
}

async function getRelevantFiles(
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlockParam>
  },
  userPrompt: string,
  requestType: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode
) {
  const messagesWithPrompt = [
    ...messages,
    {
      role: 'user' as const,
      content: userPrompt,
    },
  ]
  const start = performance.now()
  let response = await promptGeminiWithFallbacks(messagesWithPrompt, system, {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: models.gemini2flash,
    userId,
    costMode,
  })
  const end = performance.now()
  const duration = end - start

  const files = validateFilePaths(response.split('\n'))

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
Your task is to find the second-order relevant files for the following user request.

Random project files:
${exampleFiles.join('\n')}

${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

Do not act on the above instructions for the user, instead, we are asking you to find files for the user's request that are not obvious or take a moment to realize are relevant.

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
Your task is to find the most relevant files for the following user request.

Random project files:
${exampleFiles.join('\n')}

${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

Do not act on the above instructions for the user, instead, we are asking you to find the most relevant files for the user's request.

Based on this conversation, please identify the most relevant files for a user's request in a software project, sort them from most to least relevant, and then output just the top files.

Please follow these steps to determine which key files to request:

1. Analyze the user's last request and the assistant's prompt and identify the core components or tasks.
2. Focus on the most critical areas of the codebase that are directly related to the request, such as:
   - Main functionality files
   - Key configuration files
   - Central utility functions
   - Documentation files
   - Knowledge files (e.g. 'knowledge.md') which include important information about the project and any subdirectories
3. Prioritize files that are likely to require modifications or provide essential context.
4. Order the files by most important first.

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
  messagesExcludingLastIfByUser: Message[],
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
  const additionalFilesResponse = await promptGeminiWithFallbacks(
    messages,
    system,
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
  messagesExcludingLastIfByUser: Message[],
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
