import { ensureUrlProtocol } from 'common/util/string'
import { logger } from './utils/logger'

// Global cache for scraped web pages
const scrapedPagesCache: Record<string, string> = {}

export async function scrapeWebPage(url: string) {
  // Check if the page is already in the cache
  if (scrapedPagesCache[url] !== undefined) {
    return scrapedPagesCache[url]
  }

  try {
    let content = ''
    const fullUrl = ensureUrlProtocol(url)
    if (fullUrl.startsWith('https://raw.githubusercontent.com/')) {
      const response = await fetch(url)
      content = await response.text()
    } else {
      const response = await fetch(`https://r.jina.ai/${url}`)
      content = await response.text()
    }
    // Store the scraped content in the cache
    scrapedPagesCache[url] = content

    return content
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        url,
      },
      'Failed to scrape web page'
    )
    scrapedPagesCache[url] = ''
    return ''
  }
}

export function parseUrlsFromContent(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g
  return content.match(urlRegex) || []
}

const MAX_SCRAPED_CONTENT_LENGTH = 75_000
export async function getScrapedContentBlocks(urls: string[]) {
  const blocks: string[] = []
  for (const url of urls) {
    const scrapedContent = await scrapeWebPage(url)
    const truncatedScrapedContent =
      scrapedContent.length > MAX_SCRAPED_CONTENT_LENGTH
        ? scrapedContent.slice(0, MAX_SCRAPED_CONTENT_LENGTH) +
          '[...TRUNCATED: WEB PAGE CONTENT TOO LONG...]'
        : scrapedContent
    if (truncatedScrapedContent) {
      blocks.push(
        `<web_scraped_content url="${url}">\n${truncatedScrapedContent}\n</web_scraped_content>`
      )
    }
  }
  return blocks
}
