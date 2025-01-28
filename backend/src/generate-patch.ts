import { Message } from 'common/actions'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { createPatch } from 'diff'
import { applyPatch } from 'common/util/patch'
import { EXISTING_CODE_MARKER, openaiModels } from 'common/constants'
import { replaceNonStandardPlaceholderComments } from 'common/util/string'
import { logger } from './util/logger'
import { parseFileBlocks } from 'common/util/file'
import { sleep } from 'common/util/promise'

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
    normalizeLineEndings(newContent),
    EXISTING_CODE_MARKER
  )

  let patch = ''
  const { isSketchComplete, shouldAddPlaceholderComments } =
    await isSketchCompletePrompt(
      clientSessionId,
      fingerprintId,
      userInputId,
      filePath,
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
      ? `${EXISTING_CODE_MARKER}\n\n${normalizedNewContent}\n\n${EXISTING_CODE_MARKER}`
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

/**
 * This whole function is about checking for a specific case where claude
 * sketches an update to a single function, but forgets to add ${EXISTING_CODE_MARKER}
 * above and below the function.
 */
const isSketchCompletePrompt = async (
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  filePath: string,
  oldContent: string,
  newContent: string,
  messageHistory: Message[],
  fullResponse: string,
  userId?: string
) => {
  const containsExistingCodeMarker = newContent.includes(EXISTING_CODE_MARKER)
  if (containsExistingCodeMarker) {
    return { isSketchComplete: false, shouldAddPlaceholderComments: false }
  }

  const fileBlocks = parseFileBlocks(
    messageHistory
      .map((message) =>
        typeof message.content === 'string'
          ? message.content
          : message.content.map((c) => ('text' in c ? c.text : '')).join('\n')
      )
      .join('\n') + fullResponse
  )
  const fileWasPreviouslyEdited = Object.keys(fileBlocks).includes(filePath)
  if (!fileWasPreviouslyEdited) {
    // If Claude hasn't edited this file before, it's almost certainly not a local-only change.
    // Usually, it's only when Claude is editing a function for a second or third time that
    // it forgets to add ${EXISTING_CODE_MARKER}s above and below the function.
    return { isSketchComplete: true, shouldAddPlaceholderComments: false }
  }

  const prompt = `
Here's the original file:

\`\`\`
${oldContent}
\`\`\`

And here's the proposed new content for the file:

\`\`\`
${newContent}
\`\`\`

Consider the above information and conversation and answer the following question.
Most likely, the assistant intended to replace the entire original file with the new content. If so, write "REPLACE_ENTIRE_FILE".
In other cases, the assistant forgot to include the rest of the file and just wrote in one section of the file to be edited. Typically this happens if the new content focuses on the change of a single function or section of code with the intention to edit just this section, but keep the rest of the file unchanged. For example, if the new content is just a single function whereas the original file has multiple functions, and the conversation does not imply that the other functions should be deleted.
If you believe this is the scenario, please write "LOCAL_CHANGE_ONLY". Otherwise, write "REPLACE_ENTIRE_FILE".
Do not write anything else.
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
  const response = await promptOpenAI(messages as OpenAIMessage[], {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: openaiModels.gpt4o,
    userId,
  })
  const shouldAddPlaceholderComments = response.includes('LOCAL_CHANGE_ONLY')
  const isSketchComplete = !shouldAddPlaceholderComments
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
  return await promptOpenAI(messages, {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: `ft:gpt-4o-2024-08-06:manifold-markets:generate-patch-batch2:AKYtDIhk`,
    userId,
  })
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

  // Start three patches in parallel
  const startTime = Date.now()
  const patchPromises = [
    generateSinglePatch(),
    generateSinglePatch(),
    generateSinglePatch(),
  ]

  // Wait for first patch to complete
  await Promise.race(patchPromises)
  const firstPatchTime = Date.now() - startTime
  const timeout = firstPatchTime * 1.75 + 2000 // 1.75x first patch time plus 2 seconds

  // Wait for remaining patches with timeout
  const patches = (
    await Promise.all(
      patchPromises.map(async (promise) => {
        try {
          return await Promise.race([promise, sleep(timeout).then(() => null)])
        } catch (error) {
          return null
        }
      })
    )
  ).filter((patch): patch is string => patch !== null)

  const results = patches.map((p) => applyPatch(oldContent, p))

  const comparePrompt = `
I have an original file and a sketch of how to change it. Help me choose from among ${patches.length} different variations of the updated file based on the following criteria:
1. Correctness: The updated content should accurately reflect the intended changes in the sketch.
2. Minimal changes: The updated content should make only the necessary modifications. Be careful with patches that delete too much code.
3. No minor imperfections: There are sometimes minor errors in the patch like leaving out a few lines of code or duplicated content. Try to pick a file without these errors.
4. No ${EXISTING_CODE_MARKER}: Try not to choose the updated content if it contains the marker ${EXISTING_CODE_MARKER}. That marker should have been replaced with content from the original file.

Here are the original file, sketch of the changes, and ${patches.length} updated content variations:

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

Please respond with just the number of the best updated content only ("1"${patches.length > 1 ? `, "2"${patches.length > 2 ? ', or "3"' : ''}` : ''}) and nothing else.
`.trim()

  const compareMessages = [
    {
      role: 'user' as const,
      content: comparePrompt,
    },
  ]

  const comparison = await promptOpenAI(compareMessages, {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: openaiModels.gpt4o,
    userId,
  })

  logger.debug({ response: comparison, patches }, 'Best of n patch')

  const bestPatchNumber = parseInt(comparison.match(/^(\d+)/)?.[1] || '1')
  if (bestPatchNumber <= patches.length) {
    return patches[bestPatchNumber - 1]
  } else {
    logger.error({ comparison, bestPatchNumber }, 'Invalid best patch number')
    return patches[0]
  }
}
