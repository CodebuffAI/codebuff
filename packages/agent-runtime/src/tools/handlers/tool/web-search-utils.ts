/// <reference path="../../../open-websearch.d.ts" />

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const WEBSEARCH_TIMEOUT_MS = 30_000
export const MAX_WEB_FETCH_BYTES = 512_000
export const MAX_WEB_FETCH_REDIRECTS = 5

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.aws.internal',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
])

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true
  }
  const [a, b, c] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]
  if (normalized === '::' || normalized === '::1') return true

  const mappedIpv4 = normalized.match(/^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4[1])

  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16)
  return (
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xff00) === 0xff00 ||
    normalized.startsWith('2001:db8:')
  )
}

export function isBlockedWebAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isBlockedIpv4(address)
  if (version === 6) return isBlockedIpv6(address)
  return true
}

export async function assertSafePublicWebUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only public HTTP(S) URLs may be fetched')
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing credentials are not allowed')
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error(`Refusing to fetch non-public host: ${hostname}`)
  }

  if (isIP(hostname)) {
    if (isBlockedWebAddress(hostname)) {
      throw new Error(`Refusing to fetch non-public address: ${hostname}`)
    }
    return parsed
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true })
  if (resolved.length === 0) {
    throw new Error(`Host did not resolve: ${hostname}`)
  }
  const blocked = resolved.find((entry) => isBlockedWebAddress(entry.address))
  if (blocked) {
    throw new Error(
      `Refusing to fetch host ${hostname}: resolved to non-public address`,
    )
  }
  return parsed
}

export async function fetchPublicWebUrl(params: {
  url: string
  signal: AbortSignal
  headers?: Record<string, string>
  maxRedirects?: number
}): Promise<{ response: Response; finalUrl: URL }> {
  const maxRedirects = params.maxRedirects ?? MAX_WEB_FETCH_REDIRECTS
  let current = await assertSafePublicWebUrl(params.url)

  for (let redirectCount = 0; ; redirectCount++) {
    const response = await fetch(current, {
      headers: params.headers,
      redirect: 'manual',
      signal: params.signal,
    })
    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current }
    }
    if (redirectCount >= maxRedirects) {
      await response.body?.cancel()
      throw new Error(`Too many redirects (maximum ${maxRedirects})`)
    }
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location) {
      throw new Error(`Redirect response ${response.status} omitted Location`)
    }
    current = await assertSafePublicWebUrl(new URL(location, current).href)
  }
}

export async function readResponseTextWithLimit(params: {
  response: Response
  maxBytes?: number
}): Promise<{ text: string; truncated: boolean }> {
  const maxBytes = params.maxBytes ?? MAX_WEB_FETCH_BYTES
  const declaredLength = Number(params.response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await params.response.body?.cancel()
    throw new Error(`Response exceeds ${maxBytes.toLocaleString()} byte limit`)
  }

  if (!params.response.body) return { text: '', truncated: false }
  const reader = params.response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''
  let truncated = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = maxBytes - bytesRead
      if (remaining <= 0) {
        truncated = true
        await reader.cancel()
        break
      }
      const accepted =
        value.byteLength > remaining ? value.subarray(0, remaining) : value
      bytesRead += accepted.byteLength
      text += decoder.decode(accepted, { stream: true })
      if (accepted.byteLength < value.byteLength) {
        truncated = true
        await reader.cancel()
        break
      }
    }
    text += decoder.decode()
    return { text, truncated }
  } finally {
    reader.releaseLock()
  }
}

export type WebSearchResult = {
  title: string
  url: string
  description: string
}

/**
 * Execute a web search using Open Websearch as a bundled library. Do not shell
 * out to `node node_modules/open-websearch/...`: packaged Openbuff binaries do
 * not have a stable node_modules path, which produced misleading install
 * prompts for users even though this package declares the dependency.
 *
 * Returns results array on success or an error string on failure.
 */
export const executeWebSearch = async (
  query: string,
  depth: 'standard' | 'deep' = 'standard',
): Promise<{ results: WebSearchResult[] } | { error: string }> => {
  const limit = depth === 'deep' ? 10 : 5
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    process.env.OPEN_WEBSEARCH_QUIET_STARTUP ??= 'true'
    const { searchDuckDuckGo } =
      await import('open-websearch/build/engines/duckduckgo/index.js')

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Search timed out after ${WEBSEARCH_TIMEOUT_MS}ms`))
      }, WEBSEARCH_TIMEOUT_MS)
    })

    const rawResults = await Promise.race([
      searchDuckDuckGo(query, limit),
      timeoutPromise,
    ])

    const results = rawResults.slice(0, limit).map((result) => ({
      title: result.title ?? '',
      url: result.url ?? '',
      description: result.description ?? '',
    }))

    return { results }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : `Unknown web search error: ${String(error)}`,
    }
  } finally {
    if (timeout) clearTimeout(timeout)
  }
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
    const rawText = match[2]
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
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
