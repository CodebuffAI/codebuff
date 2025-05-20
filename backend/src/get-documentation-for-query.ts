import { geminiModels } from 'common/constants'

import { fetchContext7LibraryDocumentation } from './llm-apis/context7-api'

import { logger } from '@/util/logger'
import { z } from 'zod'
import { promptAiSdkStructured } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { uniq } from 'lodash'

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
  const libraryResults = await searchLibraries(query, options)

  if (!libraryResults) {
    return null
  }
  const { libraries, geminiDuration: geminiDuration1 } = libraryResults

  // Get the chunks using the analyzed project and topic
  const responseChunks = (
    await Promise.all(
      libraries.map((library) =>
        fetchContext7LibraryDocumentation(library.libraryName, {
          tokens: options.tokens,
          topic: library.topic,
        })
      )
    )
  ).flat()
  logger.info({ responseChunks }, 'Response chunks')
  const delimeter = `\n\n----------------------------------------\n\n`
  const chunks = uniq(
    responseChunks
      .filter((chunk) => chunk !== null)
      .join(delimeter)
      .split(delimeter)
  )

  let geminiDuration2: number | null = null

  // Create a prompt for Gemini to analyze the query and projects
  const prompt = `You are an expert at analyzing documentation queries. Given a user's query and a list of documentation chunks, determine which chunks are relevant to the query. Choose as few chunks as possible, likely none. Only include chunks if they are relevant to the user query.

<user_query>
${query}
</user_query>

<documentation_chunks>
${chunks.map((chunk, i) => `<chunk_${i}>${chunk}</chunk_${i}>`).join(delimeter)}
</documentation_chunks>
`

  // Get project analysis from Gemini
  const gemini2StartTime = Date.now()
  let response: {
    relevant_chunks: number[]
  }
  try {
    response = await promptAiSdkStructured(
      [{ role: 'user', content: prompt }],
      {
        ...options,
        userId: options.userId,
        model: geminiModels.gemini2_5_flash,
        temperature: 0,
        schema: z.object({
          relevant_chunks: z.array(z.number()),
        }),
        timeout: 10_000,
      }
    )
  } catch (error) {
    logger.error(
      { ...(error as Error) },
      'Failed to get Gemini response getDocumentationForQuery'
    )
    return null
  }
  geminiDuration2 = Date.now() - gemini2StartTime

  // Only proceed if we're confident in the match
  if (response.relevant_chunks.length === 0) {
    logger.info(
      { response, query, geminiDuration: geminiDuration2 },
      'Low confidence in documentation chunks match'
    )
    return null
  }

  const relevantChunks = response.relevant_chunks.map((i) => chunks[i])

  const totalDuration = Date.now() - startTime
  logger.info(
    {
      libraries,
      geminiResponse: response,
      chunks,
      relevantChunks,
      timings: {
        total: totalDuration,
        gemini1: geminiDuration1,
        gemini2: geminiDuration2,
      },
    },
    'Documentation chunks results'
  )

  return relevantChunks.join(delimeter)
}

const searchLibraries = async (
  query: string,
  options: {
    clientSessionId: string
    userInputId: string
    fingerprintId: string
    userId?: string
  }
) => {
  const prompt =
    `You are an expert at documentation for libraries. Given a user's query return a list of (library name, topic) where each library name is the name of a library and topic is a keyword or phrase that specifies a topic within the library that is most relevant to the user's query.

For example, the library name could be "Node.js" and the topic could be "async/await".

You can include the same library name multiple times with different topics, or the same topic multiple times with different library names.

If there are no obvious libraries that would be helpful, return an empty list. It is common that you would return an empty list.

<user_query>
${query}
</user_query>
    `.trim()

  const geminiStartTime = Date.now()
  try {
    const response = await promptAiSdkStructured(
      [{ role: 'user', content: prompt }],
      {
        ...options,
        userId: options.userId,
        model: geminiModels.gemini2flash,
        temperature: 0,
        schema: z.object({
          libraries: z.array(
            z.object({
              libraryName: z.string(),
              topic: z.string(),
            })
          ),
        }),
        timeout: 10_000,
      }
    )
    return {
      libraries: response.libraries,
      geminiDuration: Date.now() - geminiStartTime,
    }
  } catch (error) {
    logger.error(
      { error },
      'Failed to get Gemini response getDocumentationForQuery'
    )
    return null
  }
}
