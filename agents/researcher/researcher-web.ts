import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  displayName: 'Weeb',
  spawnerPrompt: `Browses the web to find relevant information.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered using web search',
    },
    params: {
      type: 'object',
      properties: {
        depth: {
          type: 'string',
          enum: ['standard', 'deep'],
          description: 'Search depth. Defaults to standard.',
        },
        locale: {
          type: 'string',
          description:
            'Optional locale or region to include in search queries.',
        },
        sourceDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional preferred source domains.',
        },
        dateRange: {
          type: 'string',
          description:
            'Optional date/freshness constraint to include in queries.',
        },
      },
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            status: {
              type: 'string',
              enum: ['answered', 'failed', 'skipped'],
            },
            answer: { type: 'string' },
            citations: { type: 'array', items: { type: 'string' } },
          },
          required: ['question', 'status', 'answer', 'citations'],
        },
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['url', 'title'],
        },
      },
      skippedQuestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['questions', 'sources', 'skippedQuestions'],
  },
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
      if (
        parts.length !== 4 ||
        parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
      ) {
        return false
      }
      const [a, b] = parts
      return (
        a === 0 || // 0.0.0.0/8
        a === 10 || // 10.0.0.0/8 (RFC1918)
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 (RFC1918)
        (a === 192 && b === 168) || // 192.168.0.0/16 (RFC1918)
        a === 127 || // 127.0.0.0/8 (loopback)
        (a === 169 && b === 254) || // 169.254.0.0/16 (link-local + cloud metadata)
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

    // --- Research planning helpers (M1.1-M1.2-M1.3) ---

    // Strip meta-instructions from text: "search for", "research", "find info
    // about", "look up", "can you find", etc. These are instructions to the
    // agent, not search query terms.
    function stripMetaInstructions(text: string): string {
      return text
        .replace(
          /\b(search the web for|find information about|research|look up|can you find|I need you to search|please search|help me find|do a web search for|use web search to find|find out about|gather information on|tell me about|provide information on)\s+/gi,
          '',
        )
        .replace(/^[,;:\s]+/, '')
        .trim()
    }

    // Decompose a broad prompt into focused subquestions. Each subquestion has
    // a human-readable `question` and a shorter search-engine `query`.
    // Returns at most MAX_SUBQUERIES entries.
    const MAX_SUBQUERIES = 5
    function decomposePrompt(
      p: string,
    ): Array<{ question: string; query: string }> {
      const subquestions: Array<{ question: string; query: string }> = []

      // Strategy 1: Split on numbered items (1. 2. 3. or 1) 2) etc)
      const numberedSplit = p.split(/(?:^|\n)\s*\d+[.)]\s+/m).filter(Boolean)
      if (numberedSplit.length >= 2) {
        for (
          let i = 0;
          i < numberedSplit.length && subquestions.length < MAX_SUBQUERIES;
          i++
        ) {
          const item = stripMetaInstructions(numberedSplit[i].trim())
          if (item.length > 5) {
            subquestions.push({ question: item, query: trimQuery(item) })
          }
        }
        if (subquestions.length >= 2) return subquestions
      }

      // Strategy 2: Extract sentences ending with ? as individual questions
      const questionSentences = p.match(/[^.!?]+\?/g)
      if (questionSentences && questionSentences.length >= 2) {
        for (
          let i = 0;
          i < questionSentences.length && subquestions.length < MAX_SUBQUERIES;
          i++
        ) {
          const q = stripMetaInstructions(questionSentences[i].trim())
          if (q.length > 5) {
            subquestions.push({ question: q, query: trimQuery(q) })
          }
        }
        if (subquestions.length >= 2) return subquestions
      }

      // Strategy 3: Split on bullet markers (- * •)
      const bulletSplit = p.split(/(?:^|\n)\s*[\-*•]\s+/m).filter(Boolean)
      if (bulletSplit.length >= 2) {
        for (
          let i = 0;
          i < bulletSplit.length && subquestions.length < MAX_SUBQUERIES;
          i++
        ) {
          const item = stripMetaInstructions(bulletSplit[i].trim())
          if (item.length > 5) {
            subquestions.push({ question: item, query: trimQuery(item) })
          }
        }
        if (subquestions.length >= 2) return subquestions
      }

      // Strategy 4: Split on common comparison connectors ("vs", "compared to",
      // "and", "or" between topic phrases) to extract topic pairs.
      const topics = extractTopics(p)
      if (topics.length >= 2 && subquestions.length === 0) {
        for (
          let i = 0;
          i < topics.length && subquestions.length < MAX_SUBQUERIES;
          i++
        ) {
          subquestions.push({
            question: topics[i],
            query: trimQuery(topics[i]),
          })
        }
      }

      return subquestions
    }

    // Trim a question down to a concise search-engine query: strip leading
    // question words, trailing punctuation, and keep under ~100 chars.
    function trimQuery(q: string): string {
      return q
        .replace(
          /^(what is|what are|how does|how do|how can|how should|why is|why does|why are|when is|when does|where is|where are|which is|which are|who is|who are|can you|please|could you|tell me|explain|describe|elaborate on|i want to know|i need to|i would like to)\s+/i,
          '',
        )
        .replace(/[?.,;:!]+$/, '')
        .trim()
        .slice(0, 120)
    }

    // Extract topic phrases from a comparison-style prompt by splitting on
    // delimiters like "vs", "compared to", "versus", "and", "or".
    function extractTopics(p: string): string[] {
      const cleaned = stripMetaInstructions(p)
      const parts = cleaned.split(
        /\s+(?:vs\.?|versus|compared to|compared with|rather than|instead of|or)\s+/i,
      )
      if (parts.length >= 2) {
        return parts
          .map((part) =>
            part
              .replace(/^and\s+/i, '')
              .replace(/[?.,;:!]+$/, '')
              .trim(),
          )
          .filter((t) => t.length > 3)
      }
      return []
    }

    // --- Helper: format a single search result into text + links ---
    function formatSingleResult(resultObj: {
      result?: string
      errorMessage?: string
      links?: Array<{ href: string; text: string }>
    }): string {
      const linkText =
        resultObj.links && resultObj.links.length > 0
          ? `\n\nLinks:\n${resultObj.links
              .map((l) => `- ${l.text ? `${l.text}: ` : ''}${l.href}`)
              .join('\n')}`
          : ''
      return (resultObj.result ?? resultObj.errorMessage ?? '') + linkText
    }
    const searchDepth = params?.depth === 'deep' ? 'deep' : 'standard'
    const queryControls = [
      typeof params?.locale === 'string' ? params.locale : '',
      typeof params?.dateRange === 'string' ? params.dateRange : '',
      ...(Array.isArray(params?.sourceDomains)
        ? params.sourceDomains
            .filter((domain): domain is string => typeof domain === 'string')
            .map((domain) => `site:${domain}`)
        : []),
    ]
      .filter(Boolean)
      .join(' ')
    const withControls = (query: string) =>
      queryControls ? `${query} ${queryControls}` : query

    // Extract URL from prompt (unchanged from original)
    const match = prompt?.match(/https?:\/\/[^\s)\]>"']+/)
    const rawUrl = match?.[0].replace(/[.,;:!?]+$/, '')
    // Only use url mode when the URL is safe; otherwise fall back to query mode
    // so an internal-IP URL can't drive a web_search fetch.
    const url = rawUrl && !isSsrfUrl(rawUrl) ? rawUrl : undefined

    // --- URL mode: fetch directly, exactly as before ---
    if (url) {
      const { toolResult: urlResult } = yield {
        toolName: 'web_search' as const,
        input: { url, include_links: true, max_links: 40 },
        includeToolCall: false,
      } satisfies ToolCall<'web_search'>

      const results = (urlResult
        ?.filter((r) => r.type === 'json')
        ?.map((r) => r.value)?.[0] ?? {}) as {
        result: string | undefined
        errorMessage: string | undefined
        links?: Array<{ href: string; text: string }>
      }

      const citations = (results.links ?? []).map((link) => link.href)
      yield {
        toolName: 'set_output',
        input: {
          data: {
            questions: [
              {
                question: prompt ?? url,
                status: results.result ? 'answered' : 'failed',
                answer: results.result ?? results.errorMessage ?? '',
                citations,
              },
            ],
            sources: (results.links ?? []).map((link) => ({
              url: link.href,
              title: link.text || link.href,
            })),
            skippedQuestions: [],
          },
        },
      }
      return
    }

    // --- Broad-prompt decomposition path (M1.2-M1.3-M1.4) ---
    const cleanedPrompt = prompt ? stripMetaInstructions(prompt) : ''
    const subquestions = cleanedPrompt ? decomposePrompt(cleanedPrompt) : []

    if (subquestions.length >= 2) {
      const MAX_QUERY_CALLS = Math.min(subquestions.length, MAX_SUBQUERIES)
      const MAX_ATTEMPTS = searchDepth === 'deep' ? 2 : 1
      // Reserve at least one call per decomposed question. Deep mode permits
      // one retry per question; standard mode stays to one call each.
      const MAX_TOTAL_CALLS = MAX_QUERY_CALLS * MAX_ATTEMPTS
      const allLinks: Array<{ href: string; text: string }> = []
      const seenLinks = new Set<string>()
      const sections: Array<{
        question: string
        result: string
        status: 'answered' | 'failed'
        citations: string[]
      }> = []
      let totalCalls = 0

      for (
        let i = 0;
        i < MAX_QUERY_CALLS && totalCalls < MAX_TOTAL_CALLS;
        i++
      ) {
        const sq = subquestions[i]
        let queryText = withControls(sq.query)
        let attempt = 0
        let gotResult = false
        let lastError: string | undefined

        while (
          attempt < MAX_ATTEMPTS &&
          !gotResult &&
          totalCalls < MAX_TOTAL_CALLS
        ) {
          const { toolResult: sqResult } = yield {
            toolName: 'web_search' as const,
            input: { query: queryText, depth: searchDepth },
            includeToolCall: false,
          } satisfies ToolCall<'web_search'>
          totalCalls++
          attempt++

          const parsed = (sqResult
            ?.filter((r) => r.type === 'json')
            ?.map((r) => r.value)?.[0] ?? {}) as {
            result: string | undefined
            errorMessage: string | undefined
            links?: Array<{ href: string; text: string }>
          }
          lastError = parsed?.errorMessage

          if (parsed.result) {
            const citations = (parsed.links ?? []).map((link) => link.href)
            sections.push({
              question: sq.question,
              result: parsed.result,
              status: 'answered',
              citations,
            })
            gotResult = true
            // Collect links, deduplicating by href
            if (parsed.links) {
              for (const link of parsed.links) {
                if (!seenLinks.has(link.href)) {
                  seenLinks.add(link.href)
                  allLinks.push(link)
                }
              }
            }
          } else if (attempt < MAX_ATTEMPTS && totalCalls < MAX_TOTAL_CALLS) {
            // M1.5: Retry/fallback query generation when search returns no results.
            // First retry: shorten the query to core keywords.
            // Second retry: use just the question text without trimming.
            if (attempt === 1) {
              queryText = sq.query
                .split(' ')
                .filter((w) => w.length > 3)
                .slice(0, 5)
                .join(' ')
            }
          }
        }

        // If all attempts failed, record the error
        if (!gotResult) {
          sections.push({
            question: sq.question,
            result: lastError ?? `No search results found for "${sq.query}"`,
            status: 'failed',
            citations: [],
          })
        }
      }

      const skippedQuestions = subquestions
        .slice(sections.length)
        .map((question) => question.question)
      yield {
        toolName: 'set_output',
        input: {
          data: {
            questions: [
              ...sections.map((section) => ({
                question: section.question,
                status: section.status,
                answer: section.result,
                citations: section.citations,
              })),
              ...skippedQuestions.map((question) => ({
                question,
                status: 'skipped',
                answer:
                  'Skipped because the bounded search-call budget was exhausted.',
                citations: [],
              })),
            ],
            sources: allLinks.map((link) => ({
              url: link.href,
              title: link.text || link.href,
            })),
            skippedQuestions,
          },
        },
      }
      return
    }

    // --- Simple single-query path (unchanged behavior for narrow prompts) ---
    const { toolResult } = yield {
      toolName: 'web_search' as const,
      input: {
        query: withControls(cleanedPrompt) || undefined,
        depth: searchDepth,
      },
      includeToolCall: false,
    } satisfies ToolCall<'web_search'>

    const results = (toolResult
      ?.filter((r) => r.type === 'json')
      ?.map((r) => r.value)?.[0] ?? {}) as {
      result: string | undefined
      errorMessage: string | undefined
      links?: Array<{ href: string; text: string }>
    }

    const citations = (results.links ?? []).map((link) => link.href)
    yield {
      toolName: 'set_output',
      input: {
        data: {
          questions: [
            {
              question: prompt ?? '',
              status: results.result ? 'answered' : 'failed',
              answer: results.result ?? results.errorMessage ?? '',
              citations,
            },
          ],
          sources: (results.links ?? []).map((link) => ({
            url: link.href,
            title: link.text || link.href,
          })),
          skippedQuestions: [],
        },
      },
    }
  },
}

export default definition
