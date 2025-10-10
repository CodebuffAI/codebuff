import { models } from '@codebuff/common/old-constants'
import { closeXml } from '@codebuff/common/util/xml'
import { uniq } from 'lodash'
import { z } from 'zod/v4'

import { fetchContext7LibraryDocumentation } from './llm-apis/context7-api'

import type { PromptAiSdkStructuredFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
} from '@codebuff/common/types/function-params'

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
  params: {
    query: string
    tokens?: number
    clientSessionId: string
    userInputId: string
    fingerprintId: string
    userId?: string
    logger: Logger
  } & ParamsOf<typeof suggestLibraries> &
    ParamsExcluding<typeof filterRelevantChunks, 'allChunks'>,
): Promise<string | null> {
  const {
    query,
    tokens,
    clientSessionId,
    userInputId,
    fingerprintId,
    userId,
    logger,
  } = params
  const startTime = Date.now()

  // 1. Search for relevant libraries
  const libraryResults = await suggestLibraries(params)

  if (!libraryResults || libraryResults.libraries.length === 0) {
    logger.info(
      {
        query,
        timings: {
          total: Date.now() - startTime,
        },
      },
      'Documentation chunks: No relevant libraries suggested.',
    )
    return null
  }

  const { libraries, geminiDuration: geminiDuration1 } = libraryResults

  // 2. Fetch documentation for these libraries
  const allRawChunks = (
    await Promise.all(
      libraries.map(({ libraryName, topic }) =>
        fetchContext7LibraryDocumentation({
          query: libraryName,
          tokens,
          topic,
          logger,
        }),
      ),
    )
  ).flat()

  const maxChunks = 25
  const allUniqueChunks = uniq(
    allRawChunks
      .filter((chunk) => chunk !== null)
      .join(DELIMITER)
      .split(DELIMITER),
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
      'Documentation chunks: No chunks found after fetching from Context7.',
    )
    return null
  }

  // 3. Filter relevant chunks using another LLM call
  const filterResults = await filterRelevantChunks({
    ...params,
    query,
    allChunks: allUniqueChunks,
    clientSessionId,
    userInputId,
    fingerprintId,
    userId,
    logger,
  })

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
      'Documentation chunks: No relevant chunks selected by the filter, or filter failed.',
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
    'Documentation chunks: results',
  )

  return relevantChunks.join(DELIMITER)
}

const suggestLibraries = async (params: {
  query: string
  clientSessionId: string
  userInputId: string
  fingerprintId: string
  userId?: string
  promptAiSdkStructured: PromptAiSdkStructuredFn
  logger: Logger
}) => {
  const {
    query,
    clientSessionId,
    userInputId,
    fingerprintId,
    userId,
    promptAiSdkStructured,
    logger,
  } = params
  const prompt =
    `You are an expert at documentation for libraries. Given a user's query return a list of (library name, topic) where each library name is the name of a library and topic is a keyword or phrase that specifies a topic within the library that is most relevant to the user's query.

For example, the library name could be "Node.js" and the topic could be "async/await".

You can include the same library name multiple times with different topics, or the same topic multiple times with different library names (but keep to a maximum of 3 libraries/topics).

If there are no obvious libraries that would be helpful, return an empty list. It is common that you would return an empty list.

Please just return an empty list of libraries/topics unless you are really, really sure that they are relevant.

<user_query>
${query}
${closeXml('user_query')}
    `.trim()

  const geminiStartTime = Date.now()
  try {
    const response = await promptAiSdkStructured({
      messages: [{ role: 'user', content: prompt }],
      clientSessionId,
      userInputId,
      fingerprintId,
      userId,
      model: models.openrouter_gemini2_5_flash,
      temperature: 0,
      schema: z.object({
        libraries: z.array(
          z.object({
            libraryName: z.string(),
            topic: z.string(),
          }),
        ),
      }),
      timeout: 5_000,
      logger,
    })
    return {
      libraries: response.libraries,
      geminiDuration: Date.now() - geminiStartTime,
    }
  } catch (error) {
    logger.error(
      { error },
      'Failed to get Gemini response getDocumentationForQuery',
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
async function filterRelevantChunks(params: {
  query: string
  allChunks: string[]
  clientSessionId: string
  userInputId: string
  fingerprintId: string
  userId?: string
  promptAiSdkStructured: PromptAiSdkStructuredFn
  logger: Logger
}): Promise<{ relevantChunks: string[]; geminiDuration: number } | null> {
  const {
    query,
    allChunks,
    clientSessionId,
    userInputId,
    fingerprintId,
    userId,
    promptAiSdkStructured,
    logger,
  } = params
  const prompt = `You are an expert at analyzing documentation queries. Given a user's query and a list of documentation chunks, determine which chunks are relevant to the query. Choose as few chunks as possible, likely none. Only include chunks if they are relevant to the user query.

<user_query>
${query}
${closeXml('user_query')}

<documentation_chunks>
${allChunks.map((chunk, i) => `<chunk_${i}>${chunk}${closeXml(`chunk_${i}`)}`).join(DELIMITER)}
${closeXml('documentation_chunks')}
`

  const geminiStartTime = Date.now()
  try {
    const response = await promptAiSdkStructured({
      messages: [{ role: 'user', content: prompt }],
      clientSessionId,
      userInputId,
      fingerprintId,
      userId,
      model: models.openrouter_gemini2_5_flash,
      temperature: 0,
      schema: z.object({
        relevant_chunks: z.array(z.number()),
      }),
      timeout: 20_000,
      logger,
    })
    const geminiDuration = Date.now() - geminiStartTime

    const selectedChunks = response.relevant_chunks
      .filter((index) => index >= 0 && index < allChunks.length) // Sanity check indices
      .map((i) => allChunks[i])

    return { relevantChunks: selectedChunks, geminiDuration }
  } catch (error) {
    const e = error as Error
    logger.error(
      {
        error: { message: e.message, stack: e.stack },
        query,
        allChunksCount: allChunks.length,
      },
      'Failed to get Gemini response in filterRelevantChunks',
    )
    return null
  }
}
