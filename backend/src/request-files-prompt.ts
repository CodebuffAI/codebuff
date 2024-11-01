import { range, shuffle, uniq } from 'lodash'
import { dirname } from 'path'
import { TextBlockParam } from '@anthropic-ai/sdk/resources'

import { Message } from 'common/actions'
import { ProjectFileContext } from 'common/util/file'
import { model_types, promptClaude, System } from './claude'
import { claudeModels } from 'common/constants'
import { getAllFilePaths } from 'common/project-file-tree'
import { logger } from './util/logger'

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
  const countPerRequest = assistantPrompt ? 8 : 5

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
    ? Promise.resolve({ newFilesNecessary: true, response: 'N/A' })
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
        return { newFilesNecessary: true, response: 'N/A' }
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
  const { newFilesNecessary, response: newFilesNecessaryResponse } =
    newFilesNecessaryResult
  if (!newFilesNecessary) {
    logger.info(
      {
        newFilesNecessary,
        newFilesNecessaryResponse,
        previousFiles,
      },
      'requestRelevantFiles: No new files necessary, keeping current files'
    )
    return null
  }

  const { keyResults, nonObviousResults } = await fileRequestsPromise
  const keyFiles = keyResults.flatMap((result) => result.files)
  const nonObviousFiles = nonObviousResults.flatMap((result) => result.files)

  logger.info(
    {
      keyFiles,
      nonObviousFiles,
      previousFiles,
      keyResults,
      nonObviousResults,
      newFilesNecessary,
      newFilesNecessaryResponse,
    },
    'requestRelevantFiles: Results'
  )

  return uniq([...keyFiles, ...nonObviousFiles])
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
  const numNonObviousPrompts = assistantPrompt ? 1 : 1
  const nonObviousPrompts = range(1, numNonObviousPrompts + 1).map((index) =>
    generateNonObviousRequestFilesPrompt(
      userPrompt,
      assistantPrompt,
      fileContext,
      countPerRequest,
      index * 2 - 1
    )
  )
  const nonObviousPromises = nonObviousPrompts.map((nonObviousPrompt, index) =>
    getRelevantFiles(
      {
        messages: messagesExcludingLastIfByUser,
        system,
      },
      nonObviousPrompt,
      claudeModels.sonnet,
      `Non-obvious ${index + 1}`,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    ).catch((error) => {
      logger.error({ error }, 'Error requesting non-obvious files')
      return { files: [], duration: 0 }
    })
  )

  const numKeyPrompts = assistantPrompt ? 1 : 2
  const keyPrompts = range(1, numKeyPrompts + 1).map((index) =>
    generateKeyRequestFilesPrompt(
      userPrompt,
      assistantPrompt,
      fileContext,
      index * 2 - 1,
      countPerRequest
    )
  )

  const keyPromises = keyPrompts.map((keyPrompt, index) =>
    getRelevantFiles(
      {
        messages: messagesExcludingLastIfByUser,
        system,
      },
      keyPrompt,
      claudeModels.sonnet,
      `Key ${index + 1}`,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    ).catch((error) => {
      logger.error({ error }, 'Error requesting key files')
      return { files: [], duration: 0 }
    })
  )

  const keyResults = await Promise.all(keyPromises)
  const nonObviousResults = await Promise.all(nonObviousPromises)

  return { keyResults, nonObviousResults }
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
  const prompt = `
Given the user's request and the current context, determine if new files are necessary to fulfill the request.
Current files: ${previousFiles.length > 0 ? previousFiles.join(', ') : 'None'}
User request: ${userPrompt}

We'll need any files that should be modified to fulfill the user's request, or any files that could be helpful to read to answer the user's request.

Answer with just 'YES' if new files are necessary, or 'NO' if the current files are sufficient.
`
  const response = await promptClaude(
    [...messages, { role: 'user', content: prompt }],
    {
      model: claudeModels.sonnet,
      system,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )
  const newFilesNecessary = response.trim().toUpperCase().includes('YES')
  return { newFilesNecessary, response }
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
  model: model_types,
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
    model,
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
  count: number,
  index: number
): string {
  const exampleFiles = getExampleFileList(fileContext, 100)
  return `
Random project files:
${exampleFiles.join('\n')}

${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

This is request #${index} for non-obvious project files. Ignore previous instructions.

Based on this conversation, please select files beyond the obvious files that would be helpful to complete the user's request.
Select files that might be useful for understanding and addressing the user's needs, but you would not choose in the first ${count * index + 10} files if you were asked.

Please follow these steps to determine which files to request:

1. Analyze the user's last request and the assistant's prompt and identify all components or tasks involved.
2. Consider all areas of the codebase that might be related to the request, including:
   - Main functionality files
   - Configuration files
   - Utility functions
   - Test files
   - Documentation files
3. Include files that might provide context or be indirectly related to the request.
4. Be comprehensive in your selection, but avoid including obviously irrelevant files.
5. Try to list exactly ${count} files.

Do not include any files with 'knowledge.md' in the name, because these files will be included by default.

Please provide no commentary and list the file paths you think are useful but not obvious in addressing the user's request.

Your response contain only files separated by new lines in the following format:
${range(count)
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full path from the project root directory for each file. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Please limit your response just the file paths on new lines. Do not write anything else.
`.trim()
}

function generateKeyRequestFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  index: number,
  count: number
): string {
  const start = (index - 1) * count + 1
  const end = start + count - 1
  const exampleFiles = getExampleFileList(fileContext, 100)
  return `
Random project files:
${exampleFiles.join('\n')}

${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

This is request #${index} for key project files. Ignore previous instructions.

Based on this conversation, please identify the most relevant files for a user's request in a software project, sort them from most to least relevant, and then output just the files from index ${start}-${end} in this sorted list.

Please follow these steps to determine which key files to request:

1. Analyze the user's last request and the assistant's prompt and identify the core components or tasks.
2. Focus on the most critical areas of the codebase that are directly related to the request, such as:
   - Main functionality files
   - Key configuration files
   - Central utility functions
   - Primary test files (if testing is involved)
   - Documentation files
3. Prioritize files that are likely to require modifications or provide essential context.
4. Limit your selection to approximately 10 files to ensure a focused approach.
5. Order the files by most important first.

Do not include any files with 'knowledge.md' in the name, because these files will be included by default.

Please provide no commentary and only list the file paths at index ${start} through ${end} of the most relevant files that you think are most crucial for addressing the user's request.

Your response contain only files separated by new lines in the following format:
${range(count)
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

Remember to focus on the most important files and limit your selection to exactly ${count} files. List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full path from the project root directory for each file. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full path from the project root.

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
      model: claudeModels.sonnet,
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
