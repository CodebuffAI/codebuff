import { Message } from 'common/actions'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { createPatch, diffLines } from 'diff'
import { openaiModels } from 'common/constants'
import { replaceNonStandardPlaceholderComments } from 'common/util/string'
import { logger } from './util/logger'
import { applyPatch } from 'common/util/patch'

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
      filePath,
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
    patch = await generatePatchPrompt(
      clientSessionId,
      fingerprintId,
      userInputId,
      normalizedOldContent,
      newContentWithPlaceholders,
      filePath,
      messageHistory,
      fullResponse,
      userId
    )
    patch = await refinePatch(
      clientSessionId,
      fingerprintId,
      userInputId,
      normalizedOldContent,
      normalizedNewContent,
      filePath,
      patch,
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
  filePath: string,
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
  filePath: string,
  messageHistory: Message[],
  fullResponse: string,
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

async function refinePatch(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  tentativePatch: string,
  userId?: string
): Promise<string> {
  const oldFileWithLineNumbers = oldContent
    .split('\n')
    .map((line, index) => `${index + 1}|${line}`)
    .join('\n')
  const resultAfterApplyingPatch = applyPatch(oldContent, tentativePatch)
  const prompt = `
Please review and refine the following patch. The patch is for the file ${filePath}.

Old file with line numbers:
\`\`\`
${oldFileWithLineNumbers}
\`\`\`

And here's the new file with a sketch of the changes to be made. It may have placeholder comments that should be expanded into code:
\`\`\`
${newContent}
\`\`\`

Tentative patch to transform the old file into the new file:
\`\`\`
${tentativePatch}
\`\`\`

Result after applying the tentative patch:
\`\`\`
${resultAfterApplyingPatch}
\`\`\`

Your task is to review this tentative patch and either:
A. Confirm it is accurate by responding with just "[CONFIRMED]", or
B. Rewrite the patch in full to be more accurate, ensuring it correctly transforms the old file into the intended new file.

Please do not include any other text in your response beyond "[CONFIRMED]" or the refined patch content.
`

  const response = await promptOpenAI(
    clientSessionId,
    fingerprintId,
    userInputId,
    [{ role: 'user', content: prompt }],
    openaiModels.gpt4o,
    userId
  )

  if (response.includes('[CONFIRMED]')) {
    logger.info({ response }, 'Patch confirmed')
    return tentativePatch
  } else {
    const resultAfterApplyingRefinedPatch = applyPatch(oldContent, response)
    const resultDiff = diffLines(
      resultAfterApplyingPatch,
      resultAfterApplyingRefinedPatch
    )
    logger.info(
      {
        tentativePatch,
        response,
        resultAfterApplyingPatch,
        resultAfterApplyingRefinedPatch,
        resultDiff,
      },
      'Patch refined'
    )
    return response
  }
}
