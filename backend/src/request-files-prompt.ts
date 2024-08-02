import { Message } from 'common/actions'
import {
  ProjectFileContext,
  printFileTree,
  createFileBlock,
} from 'common/src/util/file'
import { models, promptClaude } from './claude'
import { debugLog } from './debug'

export async function requestRelevantFiles(
  messages: Message[],
  fileContext: ProjectFileContext
): Promise<string[]> {
  const prompt = generateRequestFilesPrompt(messages, fileContext)
  const response = await promptClaude(prompt, { model: models.haiku })

  const fileListMatch = response.match(/<file_list>([\s\S]*?)<\/file_list>/)
  if (!fileListMatch) {
    console.error('Failed to extract file list from Claude response')
    return []
  }

  debugLog('requestRelevantFiles response:', response)

  const fileList = fileListMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return fileList
}

function generateRequestFilesPrompt(
  messages: Message[],
  fileContext: ProjectFileContext
): string {
  const { knowledgeFiles } = fileContext
  return `You are an AI assistant tasked with identifying all potentially relevant files for a user's request in a software project. Your goal is to be thorough and comprehensive, even if it means requesting more files than strictly necessary. It's better to request too many files than to miss potentially important ones.

The following files include useful background knowledge for your task:
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
${messages
  .map((message) =>
    message.role === 'user'
      ? `<user>${message.content}</user>`
      : `<assistant>${message.content}</assistant>`
  )
  .join('\n')}
</message_history>

Please follow these steps to determine which files to request:

1. Analyze the user's last request and break it down into key components or tasks.
2. Consider all possible areas of the codebase that might be affected or relevant, including:
   - Main functionality related to the request
   - Supporting utilities or helper functions
   - Configuration files
   - Test files
   - Documentation files
   - Related components or modules
3. Think about indirect dependencies or files that might provide context, even if not directly modified.
4. Consider files in all relevant directories, not just the most obvious ones.
5. Include files that might be needed for understanding the overall structure or flow of the code.
6. Include any files previously referenced in the conversation.

Provide your thought process as you go through these steps, then list all the file paths you think should be requested. Aim for a comprehensive list, even if it includes up to 100 files or more.

Your response should be in the following format:

<thought_process>
Your step-by-step reasoning here...
</thought_process>

<file_list>
path/to/file1.ts
path/to/file2.ts
...
</file_list>

Remember, it's better to include more files than to miss potentially important ones. Be thorough and expansive in your selection. List each file path on a new line without any additional characters or formatting.`
}
