import { models, openaiModels } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { parseMarkdownCodeBlock } from '@codebuff/common/util/file'
import { generateCompactId, hasLazyEdit } from '@codebuff/common/util/string'

import { promptFlashWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptRelaceAI } from './llm-apis/relace-api'

import type { CodebuffToolMessage } from '@codebuff/common/tools/list'
import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'

export async function fastRewrite(
  params: {
    initialContent: string
    editSnippet: string
    filePath: string
    userMessage: string | undefined
    logger: Logger
  } & ParamsExcluding<typeof promptRelaceAI, 'initialCode' | 'messageId'> &
    ParamsExcluding<typeof rewriteWithOpenAI, 'oldContent'>,
) {
  const { initialContent, editSnippet, filePath, userMessage, logger } = params
  const relaceStartTime = Date.now()
  const messageId = generateCompactId('cb-')
  let response = await promptRelaceAI({
    ...params,
    initialCode: initialContent,
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

// Gemini flash can only output 8k tokens, openai models can do at least 16k tokens.
export async function rewriteWithOpenAI(params: {
  oldContent: string
  editSnippet: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  promptAiSdk: PromptAiSdkFn
  logger: Logger
}): Promise<string> {
  const {
    oldContent,
    editSnippet,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    promptAiSdk,
    logger,
  } = params
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

  const response = await promptAiSdk({
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '```\n' },
    ],
    model: openaiModels.o3mini,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    logger,
  })

  return parseMarkdownCodeBlock(response) + '\n'
}

/**
 * This whole function is about checking for a specific case where claude
 * sketches an update to a single function, but forgets to add ... existing code ...
 * above and below the function.
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
      ): m is ToolMessage & {
        content: { toolName: 'create_plan' | 'str_replace' | 'write_file' }
      } => {
        return (
          m.role === 'tool' &&
          (m.content.toolName === 'create_plan' ||
            m.content.toolName === 'str_replace' ||
            m.content.toolName === 'write_file')
        )
      },
    )
    .some((m) => {
      const message = m as CodebuffToolMessage<
        'create_plan' | 'str_replace' | 'write_file'
      >
      return message.content.output[0].value.file === filePath
    })
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
    },
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
