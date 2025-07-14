import { logger } from '../../../util/logger'

export interface SearchResult {
  title: string
  url: string
  content: string
}

export async function searchWeb(
  query: string,
  options?: { depth?: 'standard' | 'deep' }
): Promise<string | null> {
  const apiKey = process.env.LINKUP_API_KEY
  if (!apiKey) {
    logger.error('LINKUP_API_KEY not found in environment variables')
    return null
  }

  const url = 'https://api.linkup.so/v1/search'
  const requestBody = {
    q: query,
    depth: options?.depth || 'standard',
    outputType: 'sourcedAnswer',
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      if (response.status === 404) {
        const responseBody = await response.text()
        logger.error(
          {
            status: response.status,
            statusText: response.statusText,
            responseBody,
            requestUrl: url,
            query,
          },
          `Linkup API returned 404 for query: ${query}`
        )
      } else {
        logger.error(`Linkup API error: ${response.status} ${response.statusText}`)
      }
      return null
    }

    const data = await response.json()
    return data.answer || null
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error('Failed to parse Linkup API response as JSON', { error })
    } else {
      logger.error('Linkup API request failed', { error })
    }
    return null
  }
}
