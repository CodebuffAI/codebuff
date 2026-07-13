import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { JSONValue } from '../types/util-types'

interface SearchQuery {
  pattern: string
  flags?: string | string[]
  cwd?: string
  maxResults?: number
}

const paramsSchema = {
  type: 'object' as const,
  properties: {
    searchQueries: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          pattern: {
            type: 'string' as const,
            description: 'The pattern to search for',
          },
          flags: {
            anyOf: [
              { type: 'string' as const },
              { type: 'array' as const, items: { type: 'string' as const } },
            ],
            description: `Optional safe ripgrep flags as a string or argv token array. Examples: "-g *.ts -A 3" or ["-g", "*.ts", "-A", "3"]. Do not quote the entire expression inside a JSON string. Dangerous flags (e.g. --exec, -r/--replace, -z/--null) are rejected.`,
          },
          cwd: {
            type: 'string' as const,
            description:
              'Optional working directory to search within, relative to the project root. Defaults to searching the entire project',
          },
          maxResults: {
            type: 'number' as const,
            description:
              'Maximum number of results to return per file. Defaults to 15. There is also a global limit of 250 results across all files',
          },
        },
        required: ['pattern'],
      },
      description: 'Array of code search queries to execute',
    },
  },
  required: ['searchQueries'],
}

const codeSearcher: SecretAgentDefinition = {
  id: 'code-searcher',
  displayName: 'Code Searcher',
  spawnerPrompt: `Mechanically runs multiple code search queries (using ripgrep line-oriented search) and returns up to 250 results across all source files, showing each line that matches the search pattern. Excludes git-ignored files. You MUST pass searchQueries in params. Example input: { "params": { "searchQueries": [{ "pattern": "createUser", "flags": "-g *.ts" }, { "pattern": "deleteUser", "flags": "-g *.ts" }, { "pattern": "UserSchema", "maxResults": 5 }] } }`,
  publisher,
  includeMessageHistory: false,
  toolNames: ['code_search', 'set_output'],
  spawnableAgents: [],
  inputSchema: {
    params: paramsSchema,
  },
  outputMode: 'structured_output',
  handleSteps: function* ({ params }) {
    /** Short, safe description of an arbitrary value for diagnostic messages. */
    function describeValue(value: unknown): string {
      if (value === null) return 'null'
      if (value === undefined) return 'undefined'
      if (Array.isArray(value)) return `an array of length ${value.length}`
      return `a value of type ${typeof value}`
    }

    /**
     * A code_search JSON result counts as "non-empty" when it actually surfaced
     * matches. ripgrep returns "Found 0 matches" stdout (or an errorMessage)
     * when nothing matched, so we treat those as not-a-match for summary purposes.
     */
    function isNonEmptyResult(value: JSONValue): boolean {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
      }
      const record = value as Record<string, unknown>
      if (typeof record.errorMessage === 'string') return false
      const stdout = record.stdout
      if (typeof stdout !== 'string') return false
      return stdout.trim().length > 0 && !stdout.includes('Found 0 matches')
    }

    const rawQueries = params?.searchQueries

    // Guard against malformed invocations that previously produced silent empty
    // results. If searchQueries is missing or not an array, report exactly what
    // was received and how to call this agent correctly instead of returning 0
    // results with an empty message.
    if (!Array.isArray(rawQueries)) {
      yield {
        toolName: 'set_output',
        input: {
          message:
            `No search ran: "searchQueries" must be an array passed in params, but received ${describeValue(
              rawQueries,
            )}. ` +
            `Call this agent like: { "params": { "searchQueries": [{ "pattern": "createUser", "flags": "-g *.ts" }] } }.`,
          results: [],
        },
        includeToolCall: false,
      }
      return
    }

    // Partition into valid queries (non-empty string pattern) and invalid ones
    // so we can run the good queries and still surface clear feedback about the
    // bad ones rather than silently dropping them.
    const validQueries: SearchQuery[] = []
    const invalidQueries: string[] = []
    rawQueries.forEach((query, index) => {
      if (
        query &&
        typeof query === 'object' &&
        typeof (query as SearchQuery).pattern === 'string' &&
        (query as SearchQuery).pattern.trim().length > 0
      ) {
        validQueries.push(query as SearchQuery)
      } else {
        invalidQueries.push(
          `query[${index}] is missing a non-empty string "pattern" (received ${describeValue(
            query,
          )})`,
        )
      }
    })

    if (validQueries.length === 0) {
      yield {
        toolName: 'set_output',
        input: {
          message:
            `No search ran: none of the ${rawQueries.length} provided ` +
            `quer${rawQueries.length === 1 ? 'y' : 'ies'} had a valid "pattern". ` +
            (invalidQueries.length > 0
              ? `${invalidQueries.join('; ')}. `
              : '') +
            `Each query needs a non-empty string "pattern".`,
          results: [],
        },
        includeToolCall: false,
      }
      return
    }

    const toolResults: JSONValue[] = []
    let matchedQueryCount = 0
    let rejectedQueryCount = invalidQueries.length
    for (const query of validQueries) {
      const { toolResult } = yield {
        toolName: 'code_search',
        input: {
          pattern: query.pattern,
          flags: query.flags,
          cwd: query.cwd,
          maxResults: query.maxResults,
        },
      }
      if (toolResult) {
        const jsonValues = toolResult
          .filter((result) => result.type === 'json')
          .map((result) => result.value)
        toolResults.push(...jsonValues)
        if (
          jsonValues.some(
            (value) =>
              value !== null &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              typeof (value as Record<string, unknown>).errorMessage ===
                'string',
          )
        ) {
          rejectedQueryCount++
        }
        if (jsonValues.some(isNonEmptyResult)) {
          matchedQueryCount++
        }
      }
    }

    // Build a concise summary so an empty result set is always explained (no
    // matches vs. an error like a malformed ripgrep flag), rather than handing
    // back results with an empty message.
    const summaryParts: string[] = [
      `Attempted ${rawQueries.length} quer${
        rawQueries.length === 1 ? 'y' : 'ies'
      }; executed ${validQueries.length}; rejected ${rejectedQueryCount}; ${matchedQueryCount} returned matches.`,
    ]
    if (invalidQueries.length > 0) {
      summaryParts.push(
        `Skipped ${invalidQueries.length} invalid quer${
          invalidQueries.length === 1 ? 'y' : 'ies'
        }: ${invalidQueries.join('; ')}.`,
      )
    }
    if (matchedQueryCount === 0) {
      summaryParts.push(
        'No matches found. Check that the pattern is valid Rust-style regex and that any flags (e.g. -g globs, cwd) are correct.',
      )
    }

    /**
     * Heuristic ≤200-token digest of raw ripgrep output so the orchestrator
     * can scan result themes without re-reading the full stdout. Deterministic
     * (no LLM call) because this agent is a pure tool-execution agent with no
     * prompt tool available in its sandboxed handleSteps.
     *
     * Format: "<N> matches across <F> files. Top files: ... Symbols: ..."
     * Bounded: top 5 files, top 8 symbols. Stays well under ~200 tokens.
     */
    function buildDigest(results: JSONValue[]): string {
      type Match = { file: string; content: string }
      const matches: Match[] = []
      let currentFile = ''
      for (const result of results) {
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          continue
        }
        const record = result as Record<string, unknown>
        if (typeof record.errorMessage === 'string') continue
        const stdout = record.stdout
        if (typeof stdout !== 'string') continue
        for (const line of stdout.split('\n')) {
          // File header lines look like "./path/to/file.ts:" or "file.ts:"
          // (end with ':', no leading whitespace). The leading "Found N matches"
          // summary line does not end with ':' so it is not misclassified.
          if (line.length > 0 && !line.startsWith(' ') && line.endsWith(':')) {
            currentFile = line.slice(0, -1).replace(/^\.\//, '')
            continue
          }
          // Match lines look like "  Line N: <content>".
          const m = line.match(/^\s+Line \d+:\s*(.*)$/)
          if (m && currentFile) {
            matches.push({ file: currentFile, content: m[1] })
          }
        }
      }
      if (matches.length === 0) return ''
      // Top files by match count.
      const fileCounts = new Map<string, number>()
      for (const mt of matches) {
        fileCounts.set(mt.file, (fileCounts.get(mt.file) ?? 0) + 1)
      }
      const topFiles = [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([f, c]) => `${f} (${c})`)
        .join(', ')
      // Candidate symbols: camelCase / PascalCase / snake_case identifiers
      // pulled from matched line content, deduped by frequency.
      const symbolCounts = new Map<string, number>()
      const symbolRe = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g
      for (const mt of matches) {
        let sm: RegExpExecArray | null
        while ((sm = symbolRe.exec(mt.content)) !== null) {
          const tok = sm[0]
          // Skip common noise tokens.
          if (
            /^(return|const|let|var|function|import|export|from|type|interface|class|new|if|else|for|while|async|await|true|false|null|undefined|this|self)$/.test(
              tok,
            )
          ) {
            continue
          }
          symbolCounts.set(tok, (symbolCounts.get(tok) ?? 0) + 1)
        }
      }
      const topSymbols = [...symbolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([s]) => s)
        .join(', ')
      const parts = [
        `${matches.length} matches across ${fileCounts.size} file${
          fileCounts.size === 1 ? '' : 's'
        }.`,
        `Top files: ${topFiles}.`,
      ]
      if (topSymbols) parts.push(`Symbols: ${topSymbols}.`)
      return parts.join(' ')
    }

    const digest = buildDigest(toolResults)

    yield {
      toolName: 'set_output',
      input: {
        message: summaryParts.join(' '),
        digest,
        results: toolResults,
      },
      includeToolCall: false,
    }
  },
}

export default codeSearcher
