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
    const response = await axios.get(url)
    const html = response.data
    const $ = cheerio.load(html)

    // Extract the main content (you may need to adjust this selector based on the target websites)
    const content = $('body').text()

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
