import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const execFileAsync = promisify(execFile)

export const WEBSEARCH_TIMEOUT_MS = 30_000

export type WebSearchResult = {
  title: string
  url: string
  description: string
}

/**
 * Resolve the open-websearch binary from node_modules.
 * Avoids requiring a global install — resolved from the
 * @codebuff/agent-runtime package's own dependency tree.
 */
export const resolveOpenWebsearchBin = (logger?: Logger): string | null => {
  try {
    const require = createRequire(import.meta.url)
    return require.resolve('open-websearch/build/index.js')
  } catch (err) {
    logger?.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to resolve open-websearch binary',
    )
    return null
  }
}

/**
 * Execute a web search using the open-websearch binary.
 * Returns results array on success or an error string on failure.
 */
export const executeWebSearch = async (
  bin: string,
  query: string,
  depth: 'standard' | 'deep' = 'standard',
): Promise<{ results: WebSearchResult[] } | { error: string }> => {
  const limit = depth === 'deep' ? 10 : 5
  const { stdout } = await execFileAsync(
    'node',
    [bin, 'search', query, '--limit', String(limit), '--engine', 'duckduckgo', '--json'],
    { timeout: WEBSEARCH_TIMEOUT_MS },
  )

  const parsed = JSON.parse(stdout) as {
    status?: string
    data?: { results?: WebSearchResult[] }
    error?: string
  }

  if (parsed.error) {
    return { error: parsed.error }
  }

  return { results: parsed.data?.results ?? [] }
}

/**
 * Strip HTML tags and decode common entities from an HTML string,
 * returning clean plain text suitable for LLM consumption.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export type PageLink = { href: string; text: string }

/**
 * Extract links from raw HTML, resolving relative URLs against baseUrl.
 * Filters out fragment-only anchors and javascript: links.
 * Deduplicates by href and caps at maxLinks.
 */
export function extractLinks(
  html: string,
  baseUrl: string,
  maxLinks: number,
): PageLink[] {
  const seen = new Set<string>()
  const links: PageLink[] = []
  const re = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null && links.length < maxLinks) {
    const rawHref = match[1]?.trim()
    const rawText = match[2]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!rawHref || rawHref.startsWith('javascript:')) continue
    let href: string
    try {
      href = new URL(rawHref, base).href
    } catch {
      continue
    }
    if (seen.has(href)) continue
    seen.add(href)
    links.push({ href, text: rawText ?? '' })
  }
  return links
}

/**
 * If the URL is a github.com/{owner}/{repo} repo page, returns the raw
 * README URL at raw.githubusercontent.com/{owner}/{repo}/HEAD/README.md.
 * Returns null for any other URL.
 */
export function resolveGitHubUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.hostname !== 'github.com') return null
  // Path should be /{owner}/{repo} optionally followed by /tree/{branch} or nothing further
  const parts = parsed.pathname.replace(/^\//, '').split('/')
  if (parts.length < 2 || !parts[0] || !parts[1]) return null
  const owner = parts[0]
  const repo = parts[1]
  // For blob/{branch}/{path} — convert to raw file URL
  if (parts.length > 4 && parts[2] === 'blob' && parts[3] && parts[4]) {
    const branch = parts[3]
    const filePath = parts.slice(4).join('/')
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
  }
  // Only handle root repo pages or /tree/* — not issues, pulls, blob without path, etc.
  if (parts.length > 2 && parts[2] !== 'tree') return null
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`
}
