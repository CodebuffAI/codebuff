import { CoreMessage } from 'ai'
import { geminiModels, openaiModels } from 'common/constants'
import { buildArray } from 'common/util/array'
import { parseFileBlocks, parseMarkdownCodeBlock } from 'common/util/file'
import { generateCompactId, hasLazyEdit } from 'common/util/string'
import { promptFlashWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptRelaceAI } from './llm-apis/relace-api'
import { promptAiSdk } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from './util/logger'

export async function fastRewrite(
  initialContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  userMessage: string | undefined,
  orgId?: string | null,
  repoUrl?: string | null
) {
  const relaceStartTime = Date.now()
  const messageId = generateCompactId('cb-')
  let response = await promptRelaceAI(initialContent, editSnippet, {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    userMessage,
    messageId,
    orgId,
    repoUrl,
  })
  const relaceDuration = Date.now() - relaceStartTime

  // Check if response still contains lazy edits
  if (
    hasLazyEdit(editSnippet) &&
    !hasLazyEdit(initialContent) &&
    hasLazyEdit(response)
  ) {
    const relaceResponse = response
    response = await rewriteWithOpenAI(
      initialContent,
      editSnippet,
      filePath,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      userMessage,
      orgId,
      repoUrl
    )
    logger.debug(
      { filePath, relaceResponse, openaiResponse: response, messageId },
      `Relace output contained lazy edits, trying GPT-4o-mini ${filePath}`
    )
  }

  logger.debug(
    {
      initialContent,
      editSnippet,
      response,
      userMessage,
      messageId,
      relaceDuration,
    },
    `fastRewrite of ${filePath}`
  )

  return response
}

// Gemini flash can only output 8k tokens, openai models can do at least 16k tokens.
export async function rewriteWithOpenAI(
  oldContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  userMessage: string | undefined,
  orgId?: string | null,
  repoUrl?: string | null
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
1. Preserve the original formatting, indentation, and comments of the old file. Please include all comments from the original file.
2. Only implement the changes shown in the edit snippet
3. Do not include any placeholder comments in your output (like "// ... existing code ..." or "# ... rest of the file ...")

Please output just the complete updated file content with the edit applied and no additional text.`

  const response = await promptAiSdk(
    [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '```\n' },
    ],
    {
      model: openaiModels.o3mini,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      orgId: orgId ?? null,
      repoUrl: repoUrl ?? null,
    }
  )

  return parseMarkdownCodeBlock(response) + '\n'
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
  messageHistory: CoreMessage[],
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
  const response = await promptFlashWithFallbacks(messages, {
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
