import { geminiModels } from 'common/constants'

import { fetchContext7LibraryDocumentation } from './llm-apis/context7-api'

import { logger } from '@/util/logger'
import { z } from 'zod'
import { promptAiSdkStructured } from './llm-apis/vercel-ai-sdk/ai-sdk'

interface ProjectAnalysis {
  confidence: number
}

const zodSchema = z.object({
  confidence: z.number().describe('0-1 score of relevance'),
}) satisfies z.ZodType<ProjectAnalysis>

/**
 * Gets relevant documentation chunks for a query by using Gemini to analyze the best project and topic
 * @param query The user's query to find documentation for
 * @param options Optional parameters for the request
 * @param options.tokens Number of tokens to retrieve (default: 5000)
 * @param options.clientSessionId Unique ID for the client session
 * @param options.fingerprintId Unique ID for the user's device/fingerprint
 * @param options.userId The ID of the user making the request
 * @returns The documentation text chunks or null if no relevant docs found
 */
export async function getDocumentationForQuery(
  query: string,
  options: {
    tokens?: number
    clientSessionId: string
    userInputId: string
    fingerprintId: string
    userId?: string
  }
): Promise<string | null> {
  const startTime = Date.now()
  let geminiDuration: number | null = null

  // Get the chunks using the analyzed project and topic
  const chunks = await fetchContext7LibraryDocumentation(query, {
    tokens: options.tokens,
  })

  // Create a prompt for Gemini to analyze the query and projects
  const prompt = `You are an expert at analyzing documentation queries. Given a user's query and a list of documentation chunks, determine how confident you are that the chunks are relevant to the query.

<user_query>
${query}
</user_query>

<documentation_chunks>
${chunks}
</documentation_chunks>
`
console.log(prompt)

  // Get project analysis from Gemini
  const geminiStartTime = Date.now()
  let response: ProjectAnalysis
  try {
    response = await promptAiSdkStructured(
      [{ role: 'user', content: prompt }],
      {
        ...options,
        userId: options.userId,
        model: geminiModels.gemini2flash,
        temperature: 0,
        schema: zodSchema,
        timeout: 10_000,
      }
    )
  } catch (error) {
    logger.error(
      { error },
      'Failed to get Gemini response getDocumentationForQuery'
    )
    return null
  }
  geminiDuration = Date.now() - geminiStartTime

  // Only proceed if we're confident in the match
  if (response.confidence <= 0.7) {
    logger.info(
      { response, query, geminiDuration },
      'Low confidence in documentation chunks match'
    )
    return null
  }

  const totalDuration = Date.now() - startTime
  logger.info(
    {
      geminiResponse: response,
      chunks,
      timings: {
        total: totalDuration,
        gemini: geminiDuration,
      },
    },
    'Documentation chunks results'
  )

  return chunks
}
