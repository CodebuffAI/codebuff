import { models } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { isAbortError, unwrapPromptResult } from '@codebuff/common/util/error'
import { parseMarkdownCodeBlock } from '@codebuff/common/util/file'
import { assistantMessage, userMessage } from '@codebuff/common/util/messages'

import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

/**
 * Applies code edits using Relace AI, with fallback to o3-mini on failure.
 *
 * @returns The updated code with edits applied.
 * @throws {Error} When the request is aborted by user. Check with `isAbortError()`. Aborts are not retried.
 */
export async function promptRelaceAI(
  params: {
    initialCode: string
    editSnippet: string
    instructions: string | undefined
    promptAiSdk: PromptAiSdkFn
    logger: Logger
  } & ParamsExcluding<PromptAiSdkFn, 'messages' | 'model'>,
) {
  const { initialCode, editSnippet, instructions, promptAiSdk, logger } = params

  try {
    const { tools: _tools, ...rest } = params
    // const model = 'relace-apply-2.5-lite'
    return (
      unwrapPromptResult(
        await promptAiSdk({
          ...rest,
          model: 'relace/relace-apply-3',
          messages: [
            userMessage(
              buildArray(
                instructions && `<instruction>${instructions}</instruction>`,
                `<code>${initialCode}</code>`,
                `<update>${editSnippet}</update>`,
              ).join('\n'),
            ),
          ],
          system: undefined,
          includeCacheControl: false,
        }),
      ) + '\n'
    )
  } catch (error) {
    // Don't fall back on user-initiated aborts - propagate immediately
    if (isAbortError(error)) {
      throw error
    }
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace AI, falling back to o3-mini',
    )

    // Fall back to o3-mini
    const prompt = `You are an expert programmer. Please rewrite this code file to implement the edit snippet while preserving as much of the original code and behavior as possible.

Initial code:
\`\`\`
${initialCode}
\`\`\`

Edit snippet (the new content to implement):
\`\`\`
${editSnippet}
\`\`\`

Important:
1. Keep the changes minimal and focused
2. Preserve the original formatting, indentation, and comments
3. Only implement the changes shown in the edit snippet
4. Return only the code, no explanation needed

Please output just the complete updated file content with no other text.`

    return (
      parseMarkdownCodeBlock(
        unwrapPromptResult(
          await promptAiSdk({
            ...params,
            messages: [userMessage(prompt), assistantMessage('```\n')],
            model: models.o3mini,
          }),
        ),
      ) + '\n'
    )
  }
}
