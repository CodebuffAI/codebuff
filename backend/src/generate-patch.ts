import { Message } from 'common/actions'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { debugLog } from './util/debug'
import { createPatch } from 'diff'
import { openaiModels } from 'common/constants'

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
  const { isSketchComplete, shouldAddPlaceholderComments } =
    await isSketchCompletePrompt(
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
    } else patch = ''
  } else {
    let newContentWithPlaceholders = shouldAddPlaceholderComments
      ? `... existing code ...\n\n${normalizedNewContent}\n\n... existing code ...`
      : normalizedNewContent
    patch = await generatePatchPrompt(
      userId,
      normalizedOldContent,
      newContentWithPlaceholders,
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
Based on the above conversation, determine if the following sketch of the changes is complete.

Here's the original file:

\`\`\`
${oldContent}
\`\`\`

And here's the new content with a sketch of the changes to be made. It may have placeholder comments that should be expanded into code:

\`\`\`
${newContent}
\`\`\`

Are there any comments in the sketch that indicate surrounding code should remain as it is in the original file? For example, comments like "// ... existing code ..." or "# .... rest of the function ...". If so, please write "YES". Otherwise, write "NO".

If "YES", don't write anything else.
If "NO", please also consider the following question. In rare cases, the new content focuses on the change of a single function or section of code with the intention to edit just this section, but the assistant forgot to add placeholder comments above and below the section to indicate the rest of the file is preserved. Without these placeholder comments the sketch of the updated file is incomplete. One clue this is the case is if the new content is much shorter than the original file. If they are about the same length, the sketch is probably complete and does not require modification.
If you strongly believe this is the scenario, please write "INCOMPLETE_SKETCH". Otherwise (most likely), write "COMPLETE_SKETCH".
`.trim()

  const messages = [
    ...messageHistory,
    {
      role: 'assistant' as const,
      content: fullResponse,
    },
    {
      role: 'user' as const,
      content: prompt,
    },
  ]
  const response = await promptOpenAI(
    userId,
    messages as OpenAIMessage[],
    openaiModels.gpt4o
  )
  const shouldAddPlaceholderComments = response.includes('INCOMPLETE_SKETCH')
  const isSketchComplete =
    response.includes('NO') && !shouldAddPlaceholderComments
  debugLog(response)
  debugLog(
    'isSketchComplete',
    isSketchComplete,
    'shouldAddPlaceholderComments',
    shouldAddPlaceholderComments
  )

  return { isSketchComplete, shouldAddPlaceholderComments }
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
    `ft:${openaiModels.gpt4o}:manifold-markets::A7wELpag`
    // ft:${models.gpt4o}:manifold-markets:run-1:A4VfZwvz`
  )
}
