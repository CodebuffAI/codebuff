import { getFileBlocks } from './project-files'
import { scrapeWebPage } from './web-scraper'
import { searchManifoldMarkets } from './manifold-api'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export type ToolHandler = (input: any, id: string) => Promise<string>

export const handleUpdateFileContext: ToolHandler = async (
  input: { prompt: string },
  id: string
) => {
  return ''
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

export const handleRunTerminalCommand: ToolHandler = async (
  input: { command: string },
  id: string
) => {
  const { command } = input
  try {
    const { stdout, stderr } = await execAsync(command)
    return `<terminal_command_result>\n<stdout>${stdout}</stdout>\n<stderr>${stderr}</stderr>\n</terminal_command_result>`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `<terminal_command_error>Failed to execute command: ${message}</terminal_command_error>`
  }
}

export const toolHandlers: Record<string, ToolHandler> = {
  update_file_context: handleUpdateFileContext,
  scrape_web_page: handleScrapeWebPage,
  search_manifold_markets: handleSearchManifoldMarkets,
  run_terminal_command: handleRunTerminalCommand,
}
