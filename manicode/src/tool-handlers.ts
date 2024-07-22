import { getFileBlocks } from './project-files'
import { scrapeWebPage } from './web-scraper'

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

export const toolHandlers: Record<string, ToolHandler> = {
  read_files: handleReadFiles,
  scrape_web_page: handleScrapeWebPage,
}
