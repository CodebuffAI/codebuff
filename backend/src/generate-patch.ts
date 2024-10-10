import { Message } from 'common/actions'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { createPatch } from 'diff'
import { applyPatch } from 'common/util/patch'
import { openaiModels } from 'common/constants'
import { replaceNonStandardPlaceholderComments } from 'common/util/string'
import { logger } from './util/logger'

export async function generatePatch(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string,
  userId?: string
) {
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const normalizedNewContent = replaceNonStandardPlaceholderComments(
    normalizeLineEndings(newContent)
  )

  let patch = ''
  const { isSketchComplete, shouldAddPlaceholderComments } =
    await isSketchCompletePrompt(
      clientSessionId,
      fingerprintId,
      userInputId,
      normalizedOldContent,
      normalizedNewContent,
      messageHistory,
      fullResponse,
      userId
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
    patch = await generateBestOfNPatch(
      clientSessionId,
      fingerprintId,
      userInputId,
      normalizedOldContent,
      newContentWithPlaceholders,
      userId
    )
  }
  const updatedPatch = patch.replaceAll('\n', lineEnding)
  return updatedPatch
}

const isSketchCompletePrompt = async (
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  oldContent: string,
  newContent: string,
  messageHistory: Message[],
  fullResponse: string,
  userId?: string
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
    clientSessionId,
    fingerprintId,
    userInputId,
    messages as OpenAIMessage[],
    openaiModels.gpt4o,
    userId
  )
  const shouldAddPlaceholderComments = response.includes('INCOMPLETE_SKETCH')
  const isSketchComplete =
    response.includes('NO') && !shouldAddPlaceholderComments
  logger.debug(
    { response, isSketchComplete, shouldAddPlaceholderComments },
    'isSketchComplete response'
  )

  return { isSketchComplete, shouldAddPlaceholderComments }
}

const generatePatchPrompt = async (
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  oldContent: string,
  newContent: string,
  userId?: string
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
    clientSessionId,
    fingerprintId,
    userInputId,
    messages,
    `ft:${openaiModels.gpt4o}:manifold-markets::A7wELpag`,
    userId
    // ft:${models.gpt4o}:manifold-markets:run-1:A4VfZwvz`
  )
}

const generateBestOfNPatch = async (
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  oldContent: string,
  newContent: string,
  userId?: string
) => {
  const generateSinglePatch = () =>
    generatePatchPrompt(
      clientSessionId,
      fingerprintId,
      userInputId,
      oldContent,
      newContent,
      userId
    )

  // Generate three patches in parallel
  const patches = await Promise.all([
    generateSinglePatch(),
    generateSinglePatch(),
    generateSinglePatch(),
  ])

  const results = patches.map((p) => applyPatch(oldContent, p))

  const comparePrompt = `
I have an original file and a sketch of how to change it. Help me choose from among three different variations of the updated file based on the following criteria:
1. Correctness: The updated content should accurately reflect the intended changes in the sketch.
2. Minimal changes: The updated content should make only the necessary modifications. Be careful with patches that delete too much code.
3. Readability: The updated content should be easy to understand.

Try not to choose the updated content if it contains comments like "// ... existing code ..." or "# .... rest of the function ...". Those placeholders should have been replaced with content from the original file.

Here are the original file, sketch of the changes, and three updated content variations:

Original file:
\`\`\`
${oldContent}
\`\`\`

Sketch of the changes:
\`\`\`
${newContent}
\`\`\`

${results
  .map((result, index) =>
    `
Updated content ${index + 1}:
\`\`\`
${result}
\`\`\`
`.trim()
  )
  .join('\n\n')}

Please respond with just the number of the best updated content only ("1", "2", or "3") and nothing else.
`.trim()

  const compareMessages = [
    {
      role: 'user' as const,
      content: comparePrompt,
    },
  ]

  const comparison = await promptOpenAI(
    clientSessionId,
    fingerprintId,
    userInputId,
    compareMessages,
    openaiModels.gpt4o,
    userId
  )

  logger.debug({ response: comparison, patches }, 'Best of n patch')

  const bestPatchNumber = parseInt(comparison.match(/^(\d+)/)?.[1] || '1')
  if ([1, 2, 3].includes(bestPatchNumber)) {
    return patches[bestPatchNumber - 1]
  } else {
    logger.error({ comparison, bestPatchNumber }, 'Invalid best patch number')
    return patches[0]
  }
}
