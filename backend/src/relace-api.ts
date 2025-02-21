import { TEST_USER_ID } from 'common/constants'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { countTokens } from './util/token-counter'
import { createMarkdownFileBlock } from 'common/util/file'
import { geminiModels } from 'common/constants'
import { promptGeminiWithFallbacks } from './gemini-with-fallbacks'

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Relace API request timed out')), ms)
  )

export async function promptRelaceAI(
  initialCode: string,
  editSnippet: string,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    messageId: string
    userMessage?: string
  }
) {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    userMessage,
    messageId,
  } = options
  const startTime = Date.now()

  try {
    const response = (await Promise.race([
      fetch('https://codebuff-instantapply.endpoint.relace.run/v1/code/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RELACE_API_KEY}`,
        },
        body: JSON.stringify({
          initialCode,
          editSnippet,
          stream: false,
          'relace-metadata': {
            'codebuff-id': messageId,
            'codebuff-user-prompt': userMessage,
          },
        }),
      }),
      timeoutPromise(100_000),
    ])) as Response

    if (!response.ok) {
      throw new Error(
        `Relace API error: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as { mergedCode: string }
    const content = data.mergedCode

    if (userId !== TEST_USER_ID) {
      const fakeRequestContent = `Initial code:${createMarkdownFileBlock('', initialCode)}\n\nEdit snippet${createMarkdownFileBlock('', editSnippet)}`
      saveMessage({
        messageId,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model: 'relace-fast-apply',
        request: [
          {
            role: 'user',
            content: fakeRequestContent,
          },
        ],
        response: content,
        inputTokens: countTokens(initialCode + editSnippet),
        outputTokens: countTokens(content),
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
      })
    }
    return content + '\n'
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace AI, falling back to Gemini Flash'
    )

    // Fall back to Gemini
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

Please output just the complete updated file content, do not include markdown backticks or other formatting:`

    const content = await promptGeminiWithFallbacks(
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

    return content
  }
}
