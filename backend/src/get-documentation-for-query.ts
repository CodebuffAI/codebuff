import { geminiModels } from 'common/constants'

import {
  context7LibrariesPromise,
  fetchContext7LibraryDocumentation,
} from './llm-apis/context7-api'
import { promptFlashWithFallbacks } from './llm-apis/gemini-with-fallbacks'

import { logger } from '@/util/logger'

interface ProjectAnalysis {
  projectId: string
  topic: string
  confidence: number
}

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

User query:
${query}

Respond in this exact JSON format:
{
  "projectId": "the-project-id",
  "topic": "relevant search keywords. only include keywords that are relevant to the documentation you are searching for.",
  "confidence": 0.8  // 0-1 score of how confident you are this is relevant
}`

  // Get project analysis from Gemini
  const geminiStartTime = Date.now()
  let response: string
  try {
    response = await promptFlashWithFallbacks(
      [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },
      ],
      undefined,
      {
        ...options,
        userId: options.userId,
        model: geminiModels.gemini2flash,
        temperature: 0,
      }
    )
  } catch (error) {
    logger.error({ error }, 'Failed to get Gemini response')
    return null
  }
  geminiDuration = Date.now() - geminiStartTime

  // Parse Gemini response
  let analysis: ProjectAnalysis
  try {
    analysis = JSON.parse('{' + response) as ProjectAnalysis
  } catch (error) {
    logger.error({ error, response }, 'Failed to parse Gemini response')
    return null
  }

  // Only proceed if we're confident in the match
  if (analysis.confidence <= 0.7) {
    logger.info(
      { analysis, query, geminiDuration },
      'Low confidence in documentation chunks match'
    )
    return null
  }

  // Get the chunks using the analyzed project and topic
  const chunks = await fetchContext7LibraryDocumentation(analysis.projectId, {
    tokens: options.tokens,
    topic: analysis.topic,
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
