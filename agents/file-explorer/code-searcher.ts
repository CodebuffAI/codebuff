import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { JSONValue } from '../types/util-types'

interface SearchQuery {
  pattern: string
  flags?: string
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
            type: 'string' as const,
            description: `Optional safe ripgrep flags. Allowed: -i/--ignore-case, -S/--smart-case, -s/--case-sensitive, -w/--word-regexp, -F/--fixed-strings, -U/--multiline, --multiline-dotall, -g/--glob, -t/--type, -T/--type-not, -A/--after-context, -B/--before-context, -C/--context (with a numeric value). Examples: "-i", "-g *.ts -g *.tsx", "-g !*.test.ts", "-A 3". Dangerous flags (e.g. --exec, -r/--replace, -z/--null) are rejected.`,
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
  spawnerPrompt:
    `Mechanically runs multiple code search queries (using ripgrep line-oriented search) and returns up to 250 results across all source files, showing each line that matches the search pattern. Excludes git-ignored files. You MUST pass searchQueries in params. Example input: { "params": { "searchQueries": [{ "pattern": "createUser", "flags": "-g *.ts" }, { "pattern": "deleteUser", "flags": "-g *.ts" }, { "pattern": "UserSchema", "maxResults": 5 }] } }`,
  model: 'anthropic/claude-sonnet-4.5',
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
            (invalidQueries.length > 0 ? `${invalidQueries.join('; ')}. ` : '') +
            `Each query needs a non-empty string "pattern".`,
          results: [],
        },
        includeToolCall: false,
      }
      return
    }

    // Allow-list of safe ripgrep flags. Mirrors parseSafeRipgrepFlags in the
    // SDK (find-files-matching-content.ts). code_search already enforces this
    // server-side, but we reject obviously unsafe queries up front so the agent
    // gets a clear "unsupported flag" message rather than a silently dropped
    // search. Helpers stay inline because handleSteps is serialized via
    // .toString() and cannot close over module-level imports.
    const SAFE_SWITCHES_NO_VALUE = new Set([
      '-i', '--ignore-case', '-S', '--smart-case', '-s', '--case-sensitive',
      '-w', '--word-regexp', '-F', '--fixed-strings', '-U', '--multiline',
      '--multiline-dotall',
      '-n', '--line-number',
    ])
    const SAFE_SWITCHES_WITH_VALUE = new Set([
      '-g', '--glob', '-t', '--type', '-T', '--type-not',
      '-A', '--after-context', '-B', '--before-context', '-C', '--context',
    ])
    function isSafeFlagsString(flags: string | undefined): { ok: true } | { ok: false; reason: string } {
      if (!flags) return { ok: true }
      const tokens = flags.match(/\S+/g) ?? []
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const eqIndex = token.indexOf('=')
        const name = eqIndex > 0 ? token.slice(0, eqIndex) : token
        if (eqIndex > 0) {
          if (!SAFE_SWITCHES_WITH_VALUE.has(name)) {
            return { ok: false, reason: `Unsupported ripgrep flag '${token}'.` }
          }
          continue
        }
        if (SAFE_SWITCHES_NO_VALUE.has(token)) continue
        if (SAFE_SWITCHES_WITH_VALUE.has(token)) {
          if (i + 1 >= tokens.length) {
            return { ok: false, reason: `Invalid ripgrep flag '${token}': missing value.` }
          }
          i++
          continue
        }
        return { ok: false, reason: `Unsupported ripgrep flag '${token}'.` }
      }
      return { ok: true }
    }

    const toolResults: JSONValue[] = []
    let matchedQueryCount = 0
    for (const query of validQueries) {
      const flagsCheck = isSafeFlagsString(query.flags)
      if (!flagsCheck.ok) {
        toolResults.push({
          errorMessage: `Skipping query for pattern "${query.pattern}": ${flagsCheck.reason} Allowed: -i/--ignore-case, -S/--smart-case, -s/--case-sensitive, -w/--word-regexp, -F/--fixed-strings, -U/--multiline, --multiline-dotall, -g/--glob, -t/--type, -T/--type-not, -A/-B/-C (with value).`,
        })
        continue
      }
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
        if (jsonValues.some(isNonEmptyResult)) {
          matchedQueryCount++
        }
      }
    }

    // Build a concise summary so an empty result set is always explained (no
    // matches vs. an error like a malformed ripgrep flag), rather than handing
    // back results with an empty message.
    const summaryParts: string[] = [
      `Ran ${validQueries.length} quer${
        validQueries.length === 1 ? 'y' : 'ies'
      }; ${matchedQueryCount} returned matches.`,
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

    yield {
      toolName: 'set_output',
      input: {
        message: summaryParts.join(' '),
        results: toolResults,
      },
      includeToolCall: false,
    }
  },
}

export default codeSearcher
