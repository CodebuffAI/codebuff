import { Message } from 'common/types/message'
import { OpenAIMessage, promptOpenAI } from './openai-api'
import { createPatch } from 'diff'
import { EXISTING_CODE_MARKER, openaiModels } from 'common/constants'
import { replaceNonStandardPlaceholderComments } from 'common/util/string'
import { logger } from './util/logger'
import { parseFileBlocks } from 'common/util/file'

export async function generatePatchWithSearchReplace(
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

  let updatedFile = normalizedNewContent

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
  if (!isSketchComplete) {
    let newContentWithPlaceholders = shouldAddPlaceholderComments
      ? `${EXISTING_CODE_MARKER}\n\n${normalizedNewContent}\n\n${EXISTING_CODE_MARKER}`
      : normalizedNewContent
    // updatedFile = await generateExpandedFileWithDiffBlocks(
    //   clientSessionId,
    //   fingerprintId,
    //   userInputId,
    //   normalizedOldContent,
    //   newContentWithPlaceholders,
    //   filePath,
    //   messageHistory,
    //   fullResponse,
    //   userId
    // )
  }
  let patch = createPatch(filePath, normalizedOldContent, normalizedNewContent)
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  } else patch = ''
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
