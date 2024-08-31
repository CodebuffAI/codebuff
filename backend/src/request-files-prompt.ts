import { uniq } from 'lodash'

import { Message } from 'common/actions'
import {
  ProjectFileContext,
  printFileTree,
  createFileBlock,
} from 'common/util/file'
import { model_types, models, promptClaude } from './claude'
import { debugLog } from './util/debug'
import { STOP_MARKER } from 'common/constants'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'

export async function requestRelevantFiles(
  {
    messages,
    system,
    tools,
  }: {
    messages: Message[]
    system: string | Array<TextBlockParam>
    tools: Tool[]
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  userId: string
): Promise<string[]> {
  const previousFiles = Object.keys(fileContext.files)

  const lastMessage = messages[messages.length - 1]
  const messagesExcludingLastIfByUser =
    lastMessage.role === 'user' ? messages.slice(0, -1) : messages
  const userPrompt =
    lastMessage.role === 'user'
      ? typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)
      : null
  const prompt = generateComprehensiveRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext
  )
  const messagesWithPrompt = [
    ...messagesExcludingLastIfByUser,
    {
      role: 'user' as const,
      content: prompt,
    },
  ]

  const comprehensivePromise = getRelevantFiles(
    {
      messages: messagesWithPrompt,
      system,
      tools,
    },
    models.haiku,
    'Comprehensive',
    userId
  ).catch((error) => {
    console.error('Error requesting files:', error)
    return { files: [], duration: 0 }
  })

  const keyPrompt = generateKeyRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext
  )
  const keyMessages = [
    ...messagesExcludingLastIfByUser,
    {
      role: 'user' as const,
      content: keyPrompt,
    },
  ]

  const keyPromise = getRelevantFiles(
    {
      messages: keyMessages,
      system,
      tools,
    },
    models.sonnet,
    'Key',
    userId
  ).catch((error) => {
    console.error('Error requesting key files:', error)
    return { files: [], duration: 0 }
  })

  const keyResult = await keyPromise

  // Early return if key result is empty
  if (keyResult.files.length === 0) {
    debugLog('Key files: []')
    debugLog('Comprehensive files: (not fetched)')
    debugLog('Deduped files: []')
    return []
  }

  const comprehensiveResult = await comprehensivePromise

  debugLog('Key files:', keyResult.files)
  debugLog('Comprehensive files:', comprehensiveResult.files)

  return uniq([
    ...keyResult.files,
    ...comprehensiveResult.files,
    ...previousFiles,
  ])
}

async function getRelevantFiles(
  {
    messages,
    system,
    tools,
  }: {
    messages: Message[]
    system: string | Array<TextBlockParam>
    tools: Tool[]
  },
  model: model_types,
  requestType: string,
  userId: string
): Promise<{ files: string[]; duration: number }> {
  const start = performance.now()
  const response = await promptClaude(messages, {
    model: model as model_types,
    system,
    tools,
    userId,
  })
  const end = performance.now()
  const duration = end - start

  debugLog(`${requestType} response time:`, duration.toFixed(0), 'ms')
  debugLog(`${requestType} response:`, response)

  const fileListMatch = response.match(/<file_list>([\s\S]*?)<\/file_list>/)
  if (!fileListMatch) {
    console.error(
      `Failed to extract file list from Claude response for ${requestType} request`
    )
    debugLog(
      `Failed to extract file list from Claude response for ${requestType} request`
    )
    return { files: [], duration }
  }

  const files = fileListMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return { files, duration }
}

function generateComprehensiveRequestFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext
): string {
  return `
${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

Based on this conversation, please identify the relevant files for a user's request in a software project. Your goal is to select all files that might be useful for understanding and addressing the user's needs.

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
5. Include any files previously referenced in the conversation.
6. Order the files by most important first.

Provide a brief explanation of your selection process, then list all the file paths you think might be relevant for addressing the user's request.

If the last user message appears to be running a terminal command, such as \`npm run test\` or \`yarn build\`, then do not request any files.

Your response should be in the following format:

<thought_process>
Your brief explanation here...
</thought_process>

<file_list>
path/to/file1.ts
path/to/file2.ts
...
</file_list>

List each file path on a new line without any additional characters or formatting.

Be sure to include the full path from the project root directory for each file. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full path from the project root.`
}

function generateKeyRequestFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext
): string {
  return `
${
  userPrompt
    ? `<user_prompt>${userPrompt}</user_prompt>`
    : `<assistant_prompt>${assistantPrompt}</assistant_prompt>`
}

Based on this conversation, please identify the key relevant files for a user's request in a software project. Your goal is to select approximately 6 key files that are crucial for understanding and addressing the user's needs.

Please follow these steps to determine which key files to request:

1. Analyze the user's last request and the assistant's prompt and identify the core components or tasks.
2. Focus on the most critical areas of the codebase that are directly related to the request, such as:
   - Main functionality files
   - Key configuration files
   - Central utility functions
   - Primary test files (if testing is involved)
3. Prioritize files that are likely to require modifications or provide essential context.
4. Limit your selection to approximately 6 files to ensure a focused approach.
5. Order the files by most important first.

Please provide no commentary and only list the file paths you think are most crucial for addressing the user's request.

If the last user message appears to be running a terminal command, such as \`npm run test\` or \`yarn build\`, then do not request any files.

Your response should be in the following format:

<file_list>
path/to/file1.ts
path/to/file2.ts
...
</file_list>

Remember to focus on the most important files and limit your selection to around 6 files. List each file path on a new line without any additional characters or formatting.

Be sure to include the full path from the project root directory for each file. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full path from the project root.`
}
