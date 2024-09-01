import { range, shuffle, uniq } from 'lodash'
import { dirname } from 'path'

import { Message } from 'common/actions'
import { ProjectFileContext } from 'common/util/file'
import { model_types, models, promptClaude } from './claude'
import { debugLog } from './util/debug'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { getAllFilePaths } from 'common/project-file-tree'

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
  userId: string
): Promise<string[]> {
  const previousFiles = Object.keys(fileContext.files)
  const countPerRequest = 4

  const lastMessage = messages[messages.length - 1]
  const messagesExcludingLastIfByUser =
    lastMessage.role === 'user' ? messages.slice(0, -1) : messages
  const userPrompt =
    lastMessage.role === 'user'
      ? typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)
      : null

  const numNonObviousPrompts = 3
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
      models.sonnet,
      `Non-obvious ${index + 1}`,
      userId
    ).catch((error) => {
      console.error('Error requesting files:', error)
      return { files: [], duration: 0 }
    })
  )

  const numKeyPrompts = 3
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
      models.sonnet,
      `Key ${index + 1}`,
      userId
    ).catch((error) => {
      console.error('Error requesting key files:', error)
      return { files: [], duration: 0 }
    })
  )

  const keyResults = await Promise.all(keyPromises)
  const keyFiles = keyResults.flatMap((result) => result.files)
  const nonObviousResults = await Promise.all(nonObviousPromises)
  const nonObviousFiles = nonObviousResults.flatMap((result) => result.files)

  debugLog('Key files:', keyFiles)
  debugLog('Non-obvious files:', nonObviousFiles)

  return uniq([...keyFiles, ...nonObviousFiles, ...previousFiles])
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
  userId: string
): Promise<{ files: string[]; duration: number }> {
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
    userId,
  })
  const end = performance.now()
  const duration = end - start

  debugLog(`${requestType} response time:`, duration.toFixed(0), 'ms')
  debugLog(`${requestType} response:`, response)

  const files = response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.includes(' '))

  return { files, duration }
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
  return `
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
  .map((i) => `path/to/file${i + 1}.ts`)
  .join('\n')}

List each file path on a new line without any additional characters or formatting.

Be sure to include the full path from the project root directory for each file. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Example response:
${getExampleFileList(fileContext, count).join('\n')}
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
  return `
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
  .map((i) => `path/to/file${i + 1}.ts`)
  .join('\n')}

Remember to focus on the most important files and limit your selection to exactly ${count} files. List each file path on a new line without any additional characters or formatting.

Be sure to include the full path from the project root directory for each file. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Example response:
${getExampleFileList(fileContext, count).join('\n')}
`.trim()
}
