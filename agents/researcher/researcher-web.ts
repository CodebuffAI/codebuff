import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
  displayName: 'Weeb',
  spawnerPrompt: `Browses the web to find relevant information.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered using web search',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information.`,
  instructionsPrompt: `Provide comprehensive research on the user's prompt.

Use web_search to find current information. Repeat the web_search tool call until you have gathered all the relevant information.

Then, write up a concise report that includes key findings for the user's prompt.
`.trim(),

  handleSteps: function* ({ prompt, params }) {
    // Keep helpers inside handleSteps because built-in agents serialize this
    // function without top-level lexical bindings.

    // SSRF guard (C1.8): reject URLs that target internal/private/link-local
    // addresses before handing them to web_search. This is a lexical check on
    // the hostname; the web_search backend should also enforce its own egress
    // guard (defense in depth). Async DNS resolution isn't possible inside the
    // serialized generator body, so DNS-rebinding-to-internal is out of scope
    // here and must be handled by the backend.
    const PRIVATE_HOST_BLOCKLIST = new Set([
      'localhost',
      'metadata',
      'metadata.google.internal',
      'metadata.aws.internal',
      '169.254.169.254',
      '0.0.0.0',
      '::1',
      '::',
    ])
    function isPrivateIpv4(ip: string): boolean {
      const parts = ip.split('.').map(Number)
      if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return false
      }
      const [a, b] = parts
      return (
        a === 0 || // 0.0.0.0/8
        a === 10 || // 10.0.0.0/8 (RFC1918)
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 (RFC1918)
        a === 192 && b === 168 || // 192.168.0.0/16 (RFC1918)
        a === 127 || // 127.0.0.0/8 (loopback)
        a === 169 && b === 254 || // 169.254.0.0/16 (link-local + cloud metadata)
        (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 (CGNAT)
      )
    }
    function isPrivateIpv6(ip: string): boolean {
      const lower = ip.toLowerCase()
      return (
        lower === '::1' ||
        lower === '::' ||
        lower.startsWith('fe80:') || // link-local
        lower.startsWith('fc') || // ULA fc00::/7
        lower.startsWith('fd') // ULA fc00::/7
      )
    }
    function isSsrfUrl(rawUrl: string): boolean {
      let parsed: URL
      try {
        parsed = new URL(rawUrl)
      } catch {
        return true // malformed -> treat as unsafe, skip url mode
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return true
      }
      const host = parsed.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
      if (PRIVATE_HOST_BLOCKLIST.has(host.toLowerCase())) {
        return true
      }
      if (isPrivateIpv4(host)) {
        return true
      }
      if (host.includes(':') && isPrivateIpv6(host)) {
        return true
      }
      return false
    }

    const match = prompt?.match(/https?:\/\/[^\s)\]>"']+/)
    const rawUrl = match?.[0].replace(/[.,;:!?]+$/, '')
    // Only use url mode when the URL is safe; otherwise fall back to query mode
    // so an internal-IP URL can't drive a web_search fetch.
    const url = rawUrl && !isSsrfUrl(rawUrl) ? rawUrl : undefined
    const { toolResult } = yield {
      toolName: 'web_search' as const,
      input: url
        ? { url, include_links: true, max_links: 40 }
        : { query: prompt || undefined, depth: 'standard' as const },
      includeToolCall: false,
    } satisfies ToolCall<'web_search'>

    const results = (toolResult
      ?.filter((r) => r.type === 'json')
      ?.map((r) => r.value)?.[0] ?? {}) as {
        result: string | undefined
        errorMessage: string | undefined
        links?: Array<{ href: string; text: string }>
      }
    const linkText =
      results.links && results.links.length > 0
        ? `\n\nLinks:\n${results.links
            .map((link) => `- ${link.text ? `${link.text}: ` : ''}${link.href}`)
            .join('\n')}`
        : ''

    yield {
      type: 'STEP_TEXT',
      text: (results.result ?? results.errorMessage ?? '') + linkText,
    }
  },
}

export default definition
