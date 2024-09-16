import { Message } from 'common/actions'
import { promptOpenAI } from './openai-api'
import { debugLog } from './util/debug'

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

  const patch = await generatePatchPrompt(
    userId,
    normalizedOldContent,
    normalizedNewContent,
    filePath,
    messageHistory,
    fullResponse
  )
  debugLog('got patch', newContent, '\n\n', patch)
  const updatedPatch = patch.replaceAll('\n', lineEnding)
  return updatedPatch
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
Here's an old file for ${filePath}:

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
