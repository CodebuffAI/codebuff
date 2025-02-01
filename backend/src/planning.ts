import { Message, FileChange } from 'common/actions'
import { models, claudeModels, CostMode } from 'common/constants'
import { countTokensJson } from './util/token-counter'
import {
  createFileBlock,
  createMarkdownFileBlock,
  isValidFilePath,
  ProjectFileContext,
  parseFileBlocks,
} from 'common/util/file'
import { promptClaude } from './claude'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { getSearchSystemPrompt } from './system-prompt'
import { hasLazyEdit } from 'common/util/string'
import { applyRemainingChanges } from './process-file-block'

const systemPrompt = `
You are a senior software engineer. You are given a request from a user and a set of files that are relevant to the request.

Use the following syntax to edit a file using xml tags. This example adds a console.log statement to the foo function in the file at path/to/file.ts:

${createFileBlock(
  'path/to/file.ts',
  `// ... existing code ...
function foo() {
  console.log('foo');
  // ... existing code ...
`
)}

Notes for editing a file:
- You must specify a file path using the filePath attribute.
- Do not wrap the file content in markdown code blocks.
- You can edit multiple files in your response by including multiple edit_file blocks.
- The content of the file can be abridged by using placeholder comments like: // ... existing code ... or # ... existing code ... (or whichever is appropriate for the language). In this case, the placeholder sections will not be changed. Only the written out code will be updated.
- If you don't use any placeholder comments (matched by a regex), the entire file will be replaced.
- Similarly, you can create new files by specifying a new file path and including the entire content of the file.

If you don't want to edit a file, but want to show code to the user, you can use the markdown format for that:
\`\`\`typescript
// Some code to show the user...
\`\`\`
`.trim()

export async function planComplexChange(
  prompt: string,
  files: Record<string, string>,
  onChunk: (chunk: string) => void,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    costMode: CostMode
  }
) {
  const messages: OpenAIMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: `${
        Object.keys(files).length > 0
          ? `Relevant Files:\n\n${Object.entries(files)
              .map(([path, content]) => createMarkdownFileBlock(path, content))
              .join('\n')}\n\n`
          : ''
      }${prompt}

Please plan and create a detailed solution.`,
    },
  ]

  let fullResponse = await promptOpenAI(messages, {
    ...options,
    model: models.o3mini,
    reasoningEffort: 'high',
  })

  const fileBlocks = parseFileBlocks(fullResponse)

  const fileProcessingPromises = Object.entries(fileBlocks).map(
    ([filePath, content]) =>
      processFileBlock(
        filePath,
        content,
        files[filePath] || null,
        fullResponse,
        options.costMode,
        options.clientSessionId,
        options.fingerprintId,
        options.userInputId,
        options.userId
      )
  )

  return {
    response: fullResponse,
    fileProcessingPromises,
  }
}

async function processFileBlock(
  filePath: string,
  newContent: string,
  oldContent: string | null,
  fullResponse: string,
  costMode: CostMode,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
): Promise<FileChange | null> {
  // For new files, just create them directly
  if (!oldContent) {
    return { filePath, content: newContent, type: 'file' }
  }

  if (hasLazyEdit(newContent)) {
    const updatedContent = await applyRemainingChanges(
      oldContent,
      newContent,
      filePath,
      fullResponse,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
      true // hasLazyEdit = true
    )
    return { filePath, content: updatedContent, type: 'file' }
  }

  return { filePath, content: newContent, type: 'file' }
}

/**
 * Prompt claude, handle tool calls, and generate file changes.
 */
export async function getRelevantFilesForPlanning(
  messages: Message[],
  prompt: string,
  fileContext: ProjectFileContext,
  costMode: CostMode,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) {
  const response = await promptClaude(
    [
      ...messages,
      {
        role: 'user',
        content: `Do not act on the above instructions for the user, instead, we are asking you to find relevant files for the following request.

Request:\n${prompt}\n\nNow, please list up to 20 file paths from the project that would be most relevant for implementing this change. Please do include knowledge.md files that are relevant, files with example code for what is needed, related tests, second-order files that are not immediately obvious but could become relevant, and any other files that would be helpful.

Only output the file paths, one per line, nothing else.`,
      },
    ],
    {
      model: claudeModels.sonnet,
      system: getSearchSystemPrompt(
        fileContext,
        costMode,
        countTokensJson(messages)
      ),
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  return response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => isValidFilePath(line))
}
