import { Message } from 'common/types/message'
import { logger } from './util/logger'
import { parseFileBlocks } from 'common/util/file'
import { generateCompactId, hasLazyEdit } from 'common/util/string'
import { geminiModels } from 'common/constants'
import { promptGeminiWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptRelaceAI } from './llm-apis/relace-api'
import { buildArray } from 'common/util/array'

export async function fastRewrite(
  initialContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  userMessage: string | undefined
) {
  const commentPreservationStartTime = Date.now()

  // First, preserve any comments from the original file in the edit snippet
  const editSnippetWithComments = await preserveCommentsInEditSnippet(
    initialContent,
    editSnippet,
    filePath,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  )
  const commentPreservationDuration = Date.now() - commentPreservationStartTime

  const relaceStartTime = Date.now()
  const messageId = generateCompactId('cb-')
  let response = await promptRelaceAI(initialContent, editSnippetWithComments, {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    userMessage,
    messageId,
  })
  const relaceDuration = Date.now() - relaceStartTime

  // Check if response still contains lazy edits
  if (
    hasLazyEdit(editSnippet) &&
    !hasLazyEdit(initialContent) &&
    hasLazyEdit(response)
  ) {
    const relaceResponse = response
    response = await rewriteWithGemini(
      initialContent,
      editSnippet,
      filePath,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      userMessage
    )
    logger.debug(
      { filePath, relaceResponse, geminiResponse: response, messageId },
      'Relace output contained lazy edits, trying Gemini'
    )
  }

  logger.debug(
    {
      initialContent,
      editSnippet,
      editSnippetWithComments,
      response,
      userMessage,
      messageId,
      commentPreservationDuration,
      relaceDuration,
      totalDuration: commentPreservationDuration + relaceDuration,
    },
    `fastRewrite of ${filePath}`
  )

  // Add newline to maintain consistency with original file endings
  return response
}

async function rewriteWithGemini(
  oldContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  userMessage: string | undefined
): Promise<string> {
  const prompt = `You are an expert programmer tasked with implementing changes to a file. Please rewrite the file to implement the changes shown in the edit snippet, while preserving the original formatting and behavior of unchanged parts.

Old file content:
\`\`\`
${oldContent}
\`\`\`

Edit snippet (the update to implement):
\`\`\`
${editSnippet}
\`\`\`

Integrate the edit snippet into the old file content to produce one coherent new file.

Important:
1. Preserve the original formatting, indentation, and comments of the old file
2. Only implement the changes shown in the edit snippet
3. Do not include any placeholder comments in your output (like "// ... existing code ..." or "# ... rest of the file ...")

Please output just the complete updated file content with the edit applied and no additional text.`
  const response = await promptGeminiWithFallbacks(
    [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '```\n' },
    ],
    undefined,
    {
      model: geminiModels.gemini2flash,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
    }
  )

  // Remove the last \n``` if present
  return response.replace(/\n```\s*$/, '')
}

export async function preserveCommentsInEditSnippet(
  initialContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) {
  const prompt = `You are an expert programmer. Modify the edit snippet to preserve comments from the original file.

Original file:
\`\`\`
${initialContent}
\`\`\`

Edit snippet:
\`\`\`
${editSnippet}
\`\`\`

Guidelines for adding back comments:
1. Look for comments in the original file that were ommitted from the edit snippet.
2. Add those comments to the edit snippet in their exact original positions.
3. Return only the modified edit snippet with no markdown formatting.
4. Do not change any code, only add comments from the original.
5. Keep the edit snippet's structure exactly the same, just with comments added.

Guidelines for removing new comments:
1. Look for comments in the edit snippet that were not in the original file.
2. If the new comment is about the code being edited, remove it. For example, if the comment is "// Add this function" then remove it. Otherwise, you should keep the new comment!

Return only the modified edit snippet with no markdown formatting after applying these guidelines.
`

  const response = await promptGeminiWithFallbacks(
    [{ role: 'user', content: prompt }],
    undefined,
    {
      clientSessionId,
      fingerprintId,
      userInputId,
      model: geminiModels.gemini2flash,
      userId,
      useGPT4oInsteadOfClaude: true,
    }
  )

  return response
}

/**
 * This whole function is about checking for a specific case where claude
 * sketches an update to a single function, but forgets to add ... existing code ...
 * above and below the function.
 */
export const shouldAddFilePlaceholders = async (
  filePath: string,
  oldContent: string,
  rewrittenNewContent: string,
  messageHistory: Message[],
  fullResponse: string,
  userId: string | undefined,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string
) => {
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
    return false
  }

  const prompt = `
Here's the original file:

\`\`\`
${oldContent}
\`\`\`

And here's the proposed new content for the file:

\`\`\`
${rewrittenNewContent}
\`\`\`

Consider the above information and conversation and answer the following question.
Most likely, the assistant intended to replace the entire original file with the new content. If so, write "REPLACE_ENTIRE_FILE".
In other cases, the assistant forgot to include the rest of the file and just wrote in one section of the file to be edited. Typically this happens if the new content focuses on the change of a single function or section of code with the intention to edit just this section, but keep the rest of the file unchanged. For example, if the new content is just a single function whereas the original file has multiple functions, and the conversation does not imply that the other functions should be deleted.
If you believe this is the scenario, please write "LOCAL_CHANGE_ONLY". Otherwise, write "REPLACE_ENTIRE_FILE".
Do not write anything else.
`.trim()

  const startTime = Date.now()

  const messages = buildArray(
    ...messageHistory,
    fullResponse && {
      role: 'assistant' as const,
      content: fullResponse,
    },
    {
      role: 'user' as const,
      content: prompt,
    }
  )
  const response = await promptGeminiWithFallbacks(messages, undefined, {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: geminiModels.gemini2flash,
    userId,
  })
  const shouldAddPlaceholderComments = response.includes('LOCAL_CHANGE_ONLY')
  logger.debug(
    {
      response,
      shouldAddPlaceholderComments,
      oldContent,
      rewrittenNewContent,
      filePath,
      duration: Date.now() - startTime,
    },
    `shouldAddFilePlaceholders response for ${filePath}`
  )

  return shouldAddPlaceholderComments
}
