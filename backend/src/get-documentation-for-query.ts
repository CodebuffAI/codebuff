import { logger } from '@/util/logger'
import { z } from 'zod'
import { uniq } from 'lodash'

import { geminiModels } from 'common/constants'
import { promptAiSdkStructured } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { fetchContext7LibraryDocumentation } from './llm-apis/context7-api'


const DELIMITER = `\n\n----------------------------------------\n\n`

/**
 * Gets relevant documentation chunks for a query by using Flash to analyze the best project and topic
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

  // 1. Search for relevant libraries
  const libraryResults = await suggestLibraries(query, options)

  if (!libraryResults || libraryResults.libraries.length === 0) {
    logger.info(
      {
        query,
        timings: {
          total: Date.now() - startTime,
        },
      },
      'Documentation chunks: No relevant libraries suggested.'
    )
    return null
  }

  const { libraries, geminiDuration: geminiDuration1 } = libraryResults

  // 2. Fetch documentation for these libraries
  const allRawChunks = (
    await Promise.all(
      libraries.map(({ libraryName, topic }) =>
        fetchContext7LibraryDocumentation(libraryName, {
          tokens: options.tokens,
          topic,
        })
      )
    )
  ).flat()

  const maxChunks = 25
  const allUniqueChunks = uniq(
    allRawChunks
      .filter((chunk) => chunk !== null)
      .join(DELIMITER)
      .split(DELIMITER)
  ).slice(0, maxChunks)

  if (allUniqueChunks.length === 0) {
    logger.info(
      {
        query,
        libraries,
        timings: {
          total: Date.now() - startTime,
          gemini1: geminiDuration1,
        },
      },
      'Documentation chunks: No chunks found after fetching from Context7.'
    )
    return null
  }

  // 3. Filter relevant chunks using another LLM call
  const filterResults = await filterRelevantChunks(
    query,
    allUniqueChunks,
    options
  )

  const totalDuration = Date.now() - startTime

  if (!filterResults || filterResults.relevantChunks.length === 0) {
    logger.info(
      {
        query,
        libraries,
        chunks: allUniqueChunks,
        chunksCount: allUniqueChunks.length,
        geminiDuration1,
        geminiDuration2: filterResults?.geminiDuration,
        timings: {
          total: totalDuration,
          gemini1: geminiDuration1,
          gemini2: filterResults?.geminiDuration,
        },
      },
      'Documentation chunks: No relevant chunks selected by the filter, or filter failed.'
    )
    return null
  }

  const { relevantChunks, geminiDuration: geminiDuration2 } = filterResults

  logger.info(
    {
      query,
      libraries,
      chunks: allUniqueChunks,
      chunksCount: allUniqueChunks.length,
      relevantChunks,
      relevantChunksCount: relevantChunks.length,
      timings: {
        total: totalDuration,
        gemini1: geminiDuration1,
        gemini2: geminiDuration2,
      },
    },
    'Documentation chunks: results'
  )

  return relevantChunks.join(DELIMITER)
}


const suggestLibraries = async (
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

You can include the same library name multiple times with different topics, or the same topic multiple times with different library names (but keep to a maximum of 3 libraries/topics).

If there are no obvious libraries that would be helpful, return an empty list. It is common that you would return an empty list.

Please just return an empty list of libraries/topics unless you are really, really sure that they are relevant.

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
        timeout: 5_000,
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

/**
 * Filters a list of documentation chunks to find those relevant to a query, using an LLM.
 * @param query The user's query.
 * @param allChunks An array of all documentation chunks to filter.
 * @param options Common request options including session and user identifiers.
 * @returns A promise that resolves to an object containing the relevant chunks and Gemini call duration, or null if an error occurs.
 */
async function filterRelevantChunks(
  query: string,
  allChunks: string[],
  options: {
    clientSessionId: string
    userInputId: string
    fingerprintId: string
    userId?: string
  }
): Promise<{ relevantChunks: string[]; geminiDuration: number } | null> {
  const prompt = `You are an expert at analyzing documentation queries. Given a user's query and a list of documentation chunks, determine which chunks are relevant to the query. Choose as few chunks as possible, likely none. Only include chunks if they are relevant to the user query.

<user_query>
${query}
</user_query>

<documentation_chunks>
${allChunks.map((chunk, i) => `<chunk_${i}>${chunk}</chunk_${i}>`).join(DELIMITER)}
</documentation_chunks>
`

  const geminiStartTime = Date.now()
  try {
    const response = await promptAiSdkStructured(
      [{ role: 'user', content: prompt }],
      {
        clientSessionId: options.clientSessionId,
        userInputId: options.userInputId,
        fingerprintId: options.fingerprintId,
        userId: options.userId,
        model: geminiModels.gemini2_5_flash,
        temperature: 0,
        schema: z.object({
          relevant_chunks: z.array(z.number()),
        }),
        timeout: 20_000,
      }
    )
    const geminiDuration = Date.now() - geminiStartTime

    const selectedChunks = response.relevant_chunks
      .filter((index) => index >= 0 && index < allChunks.length) // Sanity check indices
      .map((i) => allChunks[i])

    return { relevantChunks: selectedChunks, geminiDuration }
  } catch (error) {
    const e = error as Error
    logger.error(
      { error: { message: e.message, stack: e.stack }, query, allChunksCount: allChunks.length },
      'Failed to get Gemini response in filterRelevantChunks'
    )
    return null
  }
}
