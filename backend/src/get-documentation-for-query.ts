import { geminiModels } from 'common/constants'

import {
  context7LibrariesPromise,
  fetchContext7LibraryDocumentation,
} from './llm-apis/context7-api'

import { logger } from '@/util/logger'
import { z } from 'zod'
import { promptAiSdkStructured } from './llm-apis/vercel-ai-sdk/ai-sdk'

interface ProjectAnalysis {
  projectId: string
  topic: string
  confidence: number
}

const zodSchema = z.object({
  projectId: z.string(),
  topic: z.string(),
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

  // Get the list of available projects
  const projects = await context7LibrariesPromise
  if (projects.length === 0) {
    logger.warn('No Context7 projects available')
    return null
  }

  // Create a prompt for Gemini to analyze the query and projects
  const projectsList = projects
    .map((p) => `${p.settings.title} (ID: ${p.settings.project})`)
    .join('\n')

  const prompt = `You are an expert at analyzing documentation queries and matching them to the most relevant project and topic. Given a user's query and a list of available documentation projects, determine which project would be most relevant and what topic/keywords would help find the most relevant chunks of documentation.

Available projects:
${projectsList}

User query (in quotes):
${JSON.stringify(query)}
`

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

  // Get the chunks using the analyzed project and topic
  const chunks = await fetchContext7LibraryDocumentation(response.projectId, {
    tokens: options.tokens,
    topic: response.topic,
  })

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
