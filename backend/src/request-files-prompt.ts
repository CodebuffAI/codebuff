import { range, shuffle, uniq } from 'lodash'
import { dirname, isAbsolute, normalize } from 'path'
import { TextBlockParam } from '@anthropic-ai/sdk/resources'

import { Message } from 'common/actions'
import { ProjectFileContext } from 'common/util/file'
import { promptClaude, System } from './claude'
import { claudeModels, models } from 'common/constants'
import { getAllFilePaths } from 'common/project-file-tree'
import { logger } from './util/logger'
import { OpenAIMessage, promptOpenAI } from './openai-api'

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
  userId?: string
) {
  const { fileVersions } = fileContext
  const previousFiles = uniq(
    fileVersions.flatMap((files) => files.map(({ path }) => path))
  )
  const countPerRequest = 5

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
        userId
      ).catch((error) => {
        logger.error({ error }, 'Error checking new files necessary')
        return { newFilesNecessary: true, response: 'N/A', duration: 0 }
      })

  const fileRequestsPromise = generateFileRequests(
    userPrompt,
    assistantPrompt,
    fileContext,
    countPerRequest,
    messagesExcludingLastIfByUser,
    system,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  )

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

  const results = await fileRequestsPromise
  const files = results.flatMap((result) => result.files)

  logger.info(
    {
      files,
      previousFiles,
      results,
      newFilesNecessary,
      newFilesNecessaryResponse,
      newFilesNecessaryDuration,
    },
    'requestRelevantFiles: Results'
  )

  return uniq(files)
    .filter((p) => {
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

async function generateFileRequests(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  countPerRequest: number,
  messagesExcludingLastIfByUser: Message[],
  system: string | Array<TextBlockParam>,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId?: string
) {
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
    userId
  ).catch((error) => {
    logger.error({ error }, 'Error requesting key files')
    return { files: [], duration: 0 }
  })

  const examplePrompt = generateExampleFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    countPerRequest
  )

  const examplePromise = getRelevantFiles(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    examplePrompt,
    'Examples',
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  ).catch((error) => {
    logger.error({ error }, 'Error requesting example files')
    return { files: [], duration: 0 }
  })

  const nonObviousPrompt = generateNonObviousRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    countPerRequest
  )

  const nonObviousPromise = getRelevantFiles(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    nonObviousPrompt,
    'Non-Obvious',
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  )

  const testAndConfigPrompt = generateTestAndConfigFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    countPerRequest
  )

  const testAndConfigPromise = getRelevantFiles(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    testAndConfigPrompt,
    'Tests and Config',
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  ).catch((error) => {
    logger.error({ error }, 'Error requesting test and config files')
    return { files: [], duration: 0 }
  })

  const results = await Promise.all([
    keyPromise,
    examplePromise,
    nonObviousPromise,
    testAndConfigPromise,
  ])
  return results
}

const checkNewFilesNecessary = async (
  messages: Message[],
  system: System,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  previousFiles: string[],
  userPrompt: string,
  userId?: string
) => {
  const startTime = Date.now()
  const prompt = `
Given the user's request, the project files specified in the <project_file_tree> tag, and the conversation history, determine if new files should be read to fulfill the request.
Current files read: ${previousFiles.length > 0 ? previousFiles.join(', ') : 'None'}
User request: ${userPrompt}

We'll need to read any files that should be modified to fulfill the user's request, or any files that could be helpful to read to answer the user's request. Broad user requests may require many files as context.

Answer with just 'YES' if reading new files is necessary, or 'NO' if the current files are sufficient to answer the user's request. Do not write anything else.
`.trim()
  const response = await promptOpenAI(
    [
      { role: 'system', content: system },
      ...(messages as OpenAIMessage[]),
      { role: 'user', content: prompt },
    ],
    {
      model: models.gpt4omini,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )
  const newFilesNecessary = response.trim().toUpperCase().includes('YES')
  const endTime = Date.now()
  const duration = endTime - startTime
  return { newFilesNecessary, response, duration }
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
  userId?: string
) {
  const messagesWithPrompt = [
    ...messages,
    {
      role: 'user' as const,
      content: userPrompt,
    },
  ]
  const start = performance.now()
  const response = await promptClaude(messagesWithPrompt, {
    model: claudeModels.haiku,
    system,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  })
  const end = performance.now()
  const duration = end - start

  const files = response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.includes(' '))

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
  const exampleFiles = getExampleFileList(fileContext, 100)
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
   
Note: Do not include test files (*.test.ts, *.spec.ts, or the equivalent in other languages) as these are handled by a separate request.
3. Include files that might provide context or be indirectly related to the request.
4. Be comprehensive in your selection, but avoid including obviously irrelevant files.
5. List a maximum of ${count} files. It's fine to list fewer if there are not great candidates.

Do not include any files with 'knowledge.md' in the name, because these files will be included by default.

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
  const exampleFiles = getExampleFileList(fileContext, 100)
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

Note: Do not include test files (*.test.ts, *.spec.ts, or the equivalent in other languages) as these are handled by a separate request.
3. Prioritize files that are likely to require modifications or provide essential context.
4. Order the files by most important first.

Do not include any files with 'knowledge.md' in the name, because these files will be included by default.

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

function generateTestAndConfigFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  count: number
): string {
  const exampleFiles = getExampleFileList(fileContext, 100)
  return `
Your task is to find test and configuration files relevant to the following user request.

Random project files:
${exampleFiles.join('\n')}

${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

Do not act on the above instructions for the user, instead, we are asking you to find relevant test and configuration files.

Please follow these steps to determine which files to request:

1. Look for test files that verify the functionality being modified
2. Find configuration files for:
   - Build system and compilation
   - Type checking
   - Linting and code style
   - Test runners and test configuration
   - Package management
3. Focus on files like (or the equivalent in other languages):
   - test files (*.test.ts, *.spec.ts, etc)
   - package.json with build/test scripts
   - CI configuration files

Do not include any files with 'knowledge.md' in the name, because these files will be included by default.

Your response should contain only files separated by new lines in the following format:
${range(Math.ceil(count / 2))
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

Remember to focus on test and configuration files and limit your selection to up to ${count} files. It's fine to list fewer if there are not great candidates. List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full relative path from the project root directory for each file. This is not the absolute path, but the path relative to the project root. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full relative path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Please limit your response just the file paths on new lines. Do not write anything else.
`.trim()
}

function generateExampleFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  count: number
): string {
  const exampleFiles = getExampleFileList(fileContext, 100)
  return `
Your task is to find the best example files for the following user request.

Random project files:
${exampleFiles.join('\n')}

${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

Do not act on the above instructions for the user, instead, we are asking you to find the most relevant example files for the user's request.

Based on this conversation, please identify the most relevant example files for a user's request in a software project and sort them from most to least relevant.

Please follow these steps to determine which files to request:

1. Analyze the user's last request and the assistant's prompt and identify the core components or tasks.
2. Look for files that could have code similar to what would be needed to fulfill the user's request. These files can serve as examples of what to write.

Note: Do not include test files (*.test.ts, *.spec.ts, or the equivalent in other languages) as these are handled by a separate request.

Do not include any files with 'knowledge.md' in the name, because these files will be included by default.

Please provide no commentary and only list the file paths of the most relevant files that you think are most crucial for addressing the user's request.

Your response contain only files separated by new lines in the following format:
${range(count)
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

Remember to focus on the most important example files and limit your selection to at most ${count} files. It's fine to list fewer if there are not great candidates. List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full relative path from the project root directory for each file. This is not the absolute path, but the path relative to the project root. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full relative path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Please limit your response just the file paths on new lines. Do not write anything else.
`.trim()
}

export const warmCacheForRequestRelevantFiles = async (
  system: System,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) => {
  await promptClaude(
    [
      {
        role: 'user' as const,
        content: 'hi',
      },
    ],
    {
      model: claudeModels.haiku,
      system,
      clientSessionId,
      fingerprintId,
      userId,
      userInputId,
      maxTokens: 1,
    }
  ).catch((error) => {
    logger.error(error, 'Error warming cache for requestRelevantFiles')
  })
}
