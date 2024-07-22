import { getFileBlocks } from './project-files'
import { scrapeWebPage } from './web-scraper'
import { searchManifoldMarkets } from './manifold-api'

export type ToolHandler = (input: any, id: string) => Promise<string>

export const handleReadFiles: ToolHandler = async (
  input: { file_paths: string[] },
  id: string
) => {
  const { file_paths } = input
  return getFileBlocks(file_paths)
}

export const handleScrapeWebPage: ToolHandler = async (
  input: { url: string },
  id: string
) => {
  const { url } = input
  const content = await scrapeWebPage(url)
  if (!content) {
    return `<web_scraping_error url="${url}">Failed to scrape the web page.</web_scraping_error>`
  }
  return `<web_scraped_content url="${url}">${content}</web_scraped_content>`
}

export const handleSearchManifoldMarkets: ToolHandler = async (
  input: { query: string; limit?: number },
  id: string
) => {
  const { query, limit = 5 } = input
  try {
    const markets = await searchManifoldMarkets(query, limit)
    return JSON.stringify(markets)
  } catch (error) {
    const message = error instanceof Error ? error.message : error
    return `<manifold_search_error>Failed to search Manifold markets: ${message}</manifold_search_error>`
  }
}

export const toolHandlers: Record<string, ToolHandler> = {
  read_files: handleReadFiles,
  scrape_web_page: handleScrapeWebPage,
  search_manifold_markets: handleSearchManifoldMarkets,
}
