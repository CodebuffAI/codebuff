import { countTokens } from '@codebuff/agent-runtime/util/token-counter'
import { models } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { parseMarkdownCodeBlock } from '@codebuff/common/util/file'
import { env } from '@codebuff/internal'

import { saveMessage } from '../llm-apis/message-cost-tracker'

import type { PromptAiSdkFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Relace API request timed out')), ms),
  )

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
    // const model = 'relace-apply-2.5-lite'
    const content = await promptAiSdk({
      ...params,
      model: 'relace/relace-apply-3',
      messages: [
        {
          role: 'user',
          content: buildArray(
            instructions && `<instruction>${instructions}</instruction>`,
            `<code>${initialCode}</code>`,
            `<update>${editSnippet}</update>`,
          ).join('\n'),
        },
      ],
      system: undefined,
      includeCacheControl: false,
    })

    return content + '\n'
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace AI, falling back to o3-mini',
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

Please output just the complete updated file content with no other text.`

    const content = await promptAiSdk({
      ...params,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '```\n' },
      ],
      model: models.o3mini,
    })

    return parseMarkdownCodeBlock(content) + '\n'
  }
}

export interface RankedFile<T> {
  file: T
  score: number
}

export type FileWithPath = {
  path: string
  content: string
}

export async function rerank(
  params: {
    files: FileWithPath[]
    prompt: string
    messageId: string
    logger: Logger
  } & ParamsExcluding<
    typeof saveMessage,
    | 'model'
    | 'request'
    | 'response'
    | 'inputTokens'
    | 'outputTokens'
    | 'finishedAt'
    | 'latencyMs'
  >,
) {
  const { files, prompt, messageId, logger } = params
  const startTime = Date.now()

  if (!prompt || !files.length) {
    logger.warn('Empty prompt or files array passed to rerank')
    return files.map((f) => f.path)
  }

  // Convert files to Relace format
  const relaceFiles = files.map((f) => ({
    filename: f.path,
    code: f.content,
  }))

  try {
    const response = (await Promise.race([
      fetch('https://ranker.endpoint.relace.run/v1/code/rank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RELACE_API_KEY}`,
        },
        body: JSON.stringify({
          query: prompt,
          codebase: relaceFiles,
          token_limit: 128000,
          'relace-metadata': {
            'codebuff-id': messageId,
            'codebuff-user-prompt': prompt,
          },
        }),
      }),
      timeoutPromise(100_000),
    ])) as Response

    if (!response.ok) {
      throw new Error(
        `Relace API error: ${response.status} ${response.statusText}`,
      )
    }

    const rankings = (await response.json()) as string[]
    if (!rankings || !Array.isArray(rankings)) {
      throw new Error('Invalid response format from Relace API')
    }

    const fakeRequestContent = `Query: ${prompt}\n\nFiles:\n${files.map((f) => `${f.path}:\n${f.content}`).join('\n\n')}`
    saveMessage({
      ...params,
      model: 'relace-ranker',
      request: [
        {
          role: 'user',
          content: fakeRequestContent,
        },
      ],
      response: JSON.stringify(rankings),
      inputTokens: countTokens(fakeRequestContent),
      outputTokens: countTokens(JSON.stringify(rankings)),
      finishedAt: new Date(),
      latencyMs: Date.now() - startTime,
    })

    return rankings
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace ranker API',
    )
    // Return original files order on error instead of throwing
    return files.map((f) => f.path)
  }
}
