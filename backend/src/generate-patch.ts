import { Message } from 'common/actions'
import { promptOpenAI } from './openai-api'
import { debugLog } from './util/debug'
import { createPatch } from 'diff'

export async function generatePatch(
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
) {
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const normalizedNewContent = normalizeLineEndings(newContent)

  let patch = ''
  const isSketchComplete = await isSketchCompletePrompt(
    userId,
    normalizedOldContent,
    normalizedNewContent,
    filePath,
    messageHistory,
    fullResponse
  )
  if (isSketchComplete) {
    patch = createPatch(filePath, normalizedOldContent, normalizedNewContent)
    const lines = patch.split('\n')
    const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
    if (hunkStartIndex !== -1) {
      patch = lines.slice(hunkStartIndex).join('\n')
    }
    else patch = ''
  } else {
    patch = await generatePatchPrompt(
      userId,
      normalizedOldContent,
      normalizedNewContent,
      filePath,
      messageHistory,
      fullResponse
    )
  }
  const updatedPatch = patch.replaceAll('\n', lineEnding)
  return updatedPatch
}

const isSketchCompletePrompt = async (
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
) => {
  const prompt = `
Here's the original file:

\`\`\`
${oldContent}
\`\`\`

And here's the new content with a sketch of the changes to be made. It may have placeholder comments that should be expanded into code:

\`\`\`
${newContent}
\`\`\`

Are there any comments in the sketch that indicate surrounding code should remain as it is in the original file? For example, comments like "// ... existing code ..." or "# .... rest of the function ...". If so, please write [YES]. Otherwise, write [NO].
`.trim()

  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]
  const response = await promptOpenAI(userId, messages, 'gpt-4o-2024-08-06')
  const isSketchComplete = response.includes('NO')
  debugLog(response)
  debugLog('isSketchComplete', isSketchComplete)

  return isSketchComplete
}

const generatePatchPrompt = async (
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
) => {
  const oldFileWithLineNumbers = oldContent
    .split('\n')
    .map((line, index) => `${index + 1}|${line}`)
    .join('\n')
  const prompt = `
Here's an old file:

\`\`\`
${oldFileWithLineNumbers}
\`\`\`

And here's a sketch of the changes:

\`\`\`
${newContent}
\`\`\`

Please produce a patch file based on this change.
`.trim()

  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]
  return await promptOpenAI(
    userId,
    messages,
    'ft:gpt-4o-2024-08-06:manifold-markets::A7wELpag'
    // 'ft:gpt-4o-2024-08-06:manifold-markets:run-1:A4VfZwvz'
  )
}
