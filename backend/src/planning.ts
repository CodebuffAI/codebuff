import { WebSocket } from 'ws'
import { Message } from 'common/actions'
import { models, CostMode, geminiModels, claudeModels } from 'common/constants'
import { countTokens, countTokensJson } from './util/token-counter'
import {
  createFileBlock,
  createMarkdownFileBlock,
  isValidFilePath,
  ProjectFileContext,
  parseFileBlocks,
} from 'common/util/file'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { getSearchSystemPrompt } from './system-prompt'
import { processFileBlock } from './process-file-block'
import { requestFiles } from './websockets/websocket-action'
import { promptGeminiWithFallbacks } from './gemini-with-fallbacks'

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
- Similarly, you can create new files with the edit_file tool by specifying a new "path" attribute and including the entire content of the file.

If you don't want to edit a file, but want to show code to the user, you can use the markdown format for that:
\`\`\`typescript
// Some code to show the user...
\`\`\`
`.trim()

export async function planComplexChange(
  prompt: string,
  files: Record<string, string>,
  messageHistory: Message[],
  onChunk: (chunk: string) => void,
  ws: WebSocket,
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
      }Message History:\n\n${messageHistory
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')}

Choose one of the following options which seems most relevant to the user's request. Usually, users prefer to have their request implemented immediately by editing files (option A), but if the user asks you to plan or think through it, or if there's enough uncertainty that the user would likely want to iterate on the plan first, then choose option B.

A. Implement the user's request now

Go ahead and implement the user's request by editing files.

B. Write up a detailed implementation plan for what the user wants in a new markdown file.

1. Create a file with a descriptive name ending in .md (e.g. feature-name-plan.md or refactor-x-design.md) using the <edit_file path="...">...</edit_file> tool. (Or, if a relevant planning file already exists, just edit that! Be careful to only add your changes, or change just the relevant parts.)
2. Act as an expert architect engineer and provide direction to your editor engineer.
- Study the change request and the current code.
- Describe how to modify the code to complete the request. The editor engineer will rely solely on your instructions, so make them unambiguous and complete.
- Explain all needed code changes clearly and completely, but concisely.
- Just show the changes needed.
4. Do not waste time on much background information, focus on the exact steps of the implementation.
5. Include code, but not full files of it. Write out key snippets of code and use lots of psuedo code. For example, interfaces between modules, function signatures, and other code that is not immediately obvious should be written out explicitly. Function and method bodies could be written out in psuedo code.

Do not include any of the following sections:
- goals
- a timeline or schedule
- benefits/key improvements
- next steps

Request:\n${prompt}`,
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
        messageHistory,
        prompt,
        prompt,
        options.clientSessionId,
        options.fingerprintId,
        options.userInputId,
        options.userId,
        ws,
        options.costMode
      )
  )

  return {
    response: fullResponse,
    fileProcessingPromises,
  }
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
  const planningMessages = [
    ...messages,
    {
      role: 'user' as const,
      content: `Do not act on the above instructions for the user, instead, we are asking you to find relevant files for the following request.

Request:\n${prompt}\n\nNow, please list up to 20 file paths from the project that would be most relevant for implementing this change. Please do include knowledge.md files that are relevant, files with example code for what is needed, related tests, second-order files that are not immediately obvious but could become relevant, and any other files that would be helpful.

Only output the file paths, one per line, nothing else.`,
    },
  ]
  const systemPrompt = getSearchSystemPrompt(
    fileContext,
    costMode,
    countTokensJson(planningMessages)
  )

  const response = await promptGeminiWithFallbacks(
    planningMessages,
    systemPrompt,
    {
      model: geminiModels.gemini2flash,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
    }
  )

  return response
    .split('\n')
    .map((line) => line.trim())
    .filter(isValidFilePath)
}

export async function loadFilesForPlanning(ws: WebSocket, filePaths: string[]) {
  console.log('Loading files for planning', filePaths)
  const loadedFiles = await requestFiles(ws, filePaths)
  console.log('Loaded files for planning', filePaths)
  const fileContents = Object.fromEntries(
    Object.entries(loadedFiles).filter(
      ([, content]) =>
        content !== null &&
        content.length < 400_000 &&
        countTokens(content) < 40_000
    ) as [string, string][]
  )

  const maxFileTokens = 140_000

  let totalTokens = 0
  const filesToRemove: string[] = []
  for (const [filePath, content] of Object.entries(fileContents)) {
    if (totalTokens < maxFileTokens) {
      totalTokens += countTokens(content)
    }
    if (totalTokens >= maxFileTokens) {
      filesToRemove.push(filePath)
    }
  }
  for (const filePath of filesToRemove) {
    delete fileContents[filePath]
  }
  return fileContents
}
