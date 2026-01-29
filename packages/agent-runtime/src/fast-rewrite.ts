import { models, openaiModels } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { unwrapPromptResult } from '@codebuff/common/util/error'
import { parseMarkdownCodeBlock } from '@codebuff/common/util/file'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import { generateCompactId, hasLazyEdit } from '@codebuff/common/util/string'

import { promptFlashWithFallbacks } from './llm-api/gemini-with-fallbacks'
import { promptRelaceAI } from './llm-api/relace-api'

import type { CodebuffToolMessage } from '@codebuff/common/tools/list'
import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

/**
 * Rewrites file content using Relace AI with fallback to OpenAI.
 *
 * @throws {Error} When the request is aborted by user. Check with `isAbortError()`.
 */
export async function fastRewrite(
  params: {
    initialContent: string
    editSnippet: string
    filePath: string
    userMessage: string | undefined
    logger: Logger
  } & ParamsExcluding<typeof promptRelaceAI, 'initialCode'> &
    ParamsExcluding<typeof rewriteWithOpenAI, 'oldContent'>,
) {
  const { initialContent, editSnippet, filePath, userMessage, logger } = params
  const relaceStartTime = Date.now()
  const messageId = generateCompactId('cb-')
  let response = await promptRelaceAI({
    ...params,
    initialCode: initialContent,
  })
  const relaceDuration = Date.now() - relaceStartTime

  // Check if response still contains lazy edits
  if (
    hasLazyEdit(editSnippet) &&
    !hasLazyEdit(initialContent) &&
    hasLazyEdit(response)
  ) {
    const relaceResponse = response
    response = await rewriteWithOpenAI({
      ...params,
      oldContent: initialContent,
    })
    logger.debug(
      { filePath, relaceResponse, openaiResponse: response, messageId },
      `Relace output contained lazy edits, trying GPT-4o-mini ${filePath}`,
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
    `fastRewrite of ${filePath}`,
  )

  return response
}

/**
 * Rewrites file content using OpenAI's o3-mini model when Gemini Flash output limit is exceeded.
 * Gemini flash can only output 8k tokens, openai models can do at least 16k tokens.
 *
 * @throws {Error} When the request is aborted by user. Check with `isAbortError()`.
 */
export async function rewriteWithOpenAI(
  params: {
    oldContent: string
    editSnippet: string
    promptAiSdk: PromptAiSdkFn
  } & ParamsExcluding<PromptAiSdkFn, 'messages' | 'model'>,
): Promise<string> {
  const { oldContent, editSnippet, promptAiSdk } = params
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

  return (
    parseMarkdownCodeBlock(
      unwrapPromptResult(
        await promptAiSdk({
          ...params,
          messages: [userMessage(prompt), assistantMessage('```\n')],
          model: openaiModels.o3mini,
        }),
      ),
    ) + '\n'
  )
}

/**
 * Checks if Claude forgot to add "... existing code ..." placeholders.
 *
 * This handles a specific case where Claude sketches an update to a single function,
 * but forgets to add ... existing code ... above and below the function.
 *
 * @throws {Error} When the request is aborted by user. Check with `isAbortError()`.
 */
export const shouldAddFilePlaceholders = async (
  params: {
    filePath: string
    oldContent: string
    rewrittenNewContent: string
    messageHistory: Message[]
    fullResponse: string
    logger: Logger
  } & ParamsExcluding<typeof promptFlashWithFallbacks, 'messages' | 'model'>,
) => {
  const {
    filePath,
    oldContent,
    rewrittenNewContent,
    messageHistory,
    fullResponse,
    logger,
  } = params
  const fileWasPreviouslyEdited = messageHistory
    .filter(
      (
        m,
      ): m is CodebuffToolMessage<
        'create_plan' | 'str_replace' | 'write_file'
      > => {
        return (
          m.role === 'tool' &&
          (m.toolName === 'create_plan' ||
            m.toolName === 'str_replace' ||
            m.toolName === 'write_file')
        )
      },
    )
    .some((m) => m.content[0].value.file === filePath)
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
    fullResponse && assistantMessage(fullResponse),
    userMessage(prompt),
  )
  const response = await promptFlashWithFallbacks({
    ...params,
    messages,
    model: models.openrouter_gemini2_5_flash,
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
    `shouldAddFilePlaceholders response for ${filePath}`,
  )

  return shouldAddPlaceholderComments
}
