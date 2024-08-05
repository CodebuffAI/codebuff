import { uniq } from 'lodash'

import { Message } from 'common/actions'
import {
  ProjectFileContext,
  printFileTree,
  createFileBlock,
} from 'common/util/file'
import { model_types, models, promptClaude } from './claude'
import { debugLog } from './debug'
import { STOP_MARKER } from 'common/constants'
import { promptOpenAI } from './openai-api'

export async function requestRelevantFiles(
  messages: Message[],
  fileContext: ProjectFileContext,
  requestPrompt: string | null
): Promise<string[]> {
  const keyPromise = getRelevantFiles(
    generateKeyRequestFilesPrompt(messages, fileContext, requestPrompt),
    models.sonnet,
    'Key'
  )

  const comprehensivePromise = getRelevantFiles(
    generateComprehensiveRequestFilesPrompt(
      messages,
      fileContext,
      requestPrompt
    ),
    'gpt-4o-mini',
    'Comprehensive'
  ).catch((error) => {
    console.error('Error requesting files:', error)
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

  const dedupedFiles = uniq([...keyResult.files, ...comprehensiveResult.files])

  debugLog('Key files:', keyResult.files)
  debugLog('Comprehensive files:', comprehensiveResult.files)
  debugLog('Deduped files:', dedupedFiles)

  return dedupedFiles
}

async function getRelevantFiles(
  prompt: string,
  model: model_types | 'gpt-4o-mini',
  requestType: string
): Promise<{ files: string[]; duration: number }> {
  const start = performance.now()
  const response = await (model === 'gpt-4o-mini'
    ? promptOpenAI([{ role: 'user', content: prompt }], model)
    : promptClaude(prompt, { model }))
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

const innerPromptContent = (
  messages: Message[],
  fileContext: ProjectFileContext,
  requestPrompt: string | null
) => {
  const { knowledgeFiles } = fileContext

  const messagesString = messages
    .map((message) =>
      message.role === 'user'
        ? `<user>${JSON.stringify(message.content)}</user>`
        : `<assistant>${JSON.stringify(message.content)}</assistant>`
    )
    .join('\n')
    .replaceAll(STOP_MARKER, '')

  const requestPromptString = requestPrompt
    ? `\nAdditionally, the assistant has requested files with the following prompt:
<request_prompt>${requestPrompt}</request_prompt>`
    : ''

  return `The following files include useful background knowledge for your task:
<knowledge_files>
${Object.entries(knowledgeFiles)
  .map(([path, content]) => createFileBlock(path, content))
  .join('\n')}
</knowledge_files>

Here are all the files in the project you could request:
<file_tree>
${printFileTree(fileContext.fileTree)}
</file_tree>

<message_history>
${messagesString}
</message_history>
${requestPromptString}`
}

function generateComprehensiveRequestFilesPrompt(
  messages: Message[],
  fileContext: ProjectFileContext,
  requestPrompt: string | null
): string {
  return `You are an AI assistant tasked with identifying relevant files for a user's request in a software project. Your goal is to select all files that might be useful for understanding and addressing the user's needs.

${innerPromptContent(messages, fileContext, requestPrompt)}

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

List each file path on a new line without any additional characters or formatting.`
}

function generateKeyRequestFilesPrompt(
  messages: Message[],
  fileContext: ProjectFileContext,
  requestPrompt: string | null
): string {
  return `You are an AI assistant tasked with identifying the most relevant files for a user's request in a software project. Your goal is to select approximately 6 key files that are crucial for understanding and addressing the user's needs.

${innerPromptContent(messages, fileContext, requestPrompt)}

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

Provide a brief explanation of your selection process, then list the file paths you think are most crucial for addressing the user's request.

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

Remember to focus on the most important files and limit your selection to around 6 files. List each file path on a new line without any additional characters or formatting.`
}
