import axios from 'axios'
import * as cheerio from 'cheerio'

// Global cache for scraped web pages
const scrapedPagesCache: Record<string, string> = {}

export async function scrapeWebPage(url: string) {
  // Check if the page is already in the cache
  if (scrapedPagesCache[url] !== undefined) {
    return scrapedPagesCache[url]
  }

  try {
    // const response = await axios.get(url)
    const response = await axios.get(`https://r.jina.ai/${url}`)
    const content = response.data
    // const html = response.data
    // const $ = cheerio.load(html)

    // // Extract the main content (you may need to adjust this selector based on the target websites)
    // const content = $('body').text()

    // Store the scraped content in the cache
    scrapedPagesCache[url] = content

    return content
  } catch (error) {
    // console.error(
    //   `Error scraping web page ${url}:`,
    //   error instanceof Error ? error.message : error
    // )
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
