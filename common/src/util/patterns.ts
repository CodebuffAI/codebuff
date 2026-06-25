/**
 * Patterns library loader (P1.14, mex-borrowing).
 *
 * Reads `<projectRoot>/agents/patterns/INDEX.md` and parses it into a
 * structured catalog so the agent runtime can surface the list of available
 * pattern guides in the system prompt. Mirrors the mex `patterns/INDEX.md`
 * pattern: a small markdown table that maps `pattern | file | description`.
 *
 * Individual pattern files are NOT loaded here — the runtime renders only the
 * INDEX into the prompt (constant token cost) and agents `read_files` the
 * specific pattern on demand when a task matches. This keeps context usage
 * independent of how many patterns exist.
 *
 * The `index-sync` checker in `scripts/memory-drift-guard.ts` lints the
 * INDEX for entries pointing at files that no longer exist on disk.
 */

import fs from 'fs'
import path from 'path'

import type { Logger } from '../types/contracts/logger'

/** One row of the patterns INDEX table. */
export type PatternsIndexEntry = {
  /** The kebab-case pattern name (first column). */
  name: string
  /** Repo-root-relative path to the pattern markdown file (second column). */
  file: string
  /** One-line description (third column). */
  description: string
}

/** Parsed patterns catalog. */
export type PatternsIndex = PatternsIndexEntry[]

const PATTERNS_INDEX_RELATIVE = path.join('agents', 'patterns', 'INDEX.md')

/**
 * Parse an `agents/patterns/INDEX.md` markdown body into a `PatternsIndex`.
 *
 * The expected format is a markdown pipe-table with three columns:
 * `| pattern | file | description |`. Lines outside the first table are
 * ignored; the header and separator rows are skipped. Rows that don't match
 * the expected shape are skipped silently (the drift guard flags stale
 * paths separately).
 *
 * Example:
 *
 *   | pattern | file | description |
 *   | --- | --- | --- |
 *   | add-a-new-tool | `agents/patterns/add-a-new-tool.md` | Add a new tool |
 */
export function parsePatternsIndex(markdown: string): PatternsIndex {
  const out: PatternsIndex = []
  if (typeof markdown !== 'string' || !markdown.trim()) return out
  const lines = markdown.split(/\r?\n/)
  let inTable = false
  let headerSeen = false
  let tableEnded = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith('|')) {
      if (inTable && line === '') {
        // First table ended; stop parsing so a second table in the same
        // file doesn't get merged in.
        inTable = false
        tableEnded = true
      }
      continue
    }
    if (tableEnded) continue
    inTable = true
    const split = line.split('|')
    const cells = split.slice(1, -1).map((cell) => cell.trim())
    if (cells.length < 3) continue
    if (!headerSeen) {
      headerSeen = true
      continue
    }
    if (/^[-:\s|]+$/.test(line)) continue
    const [nameRaw, fileRaw, descRaw, ...rest] = cells
    if (rest.length > 0) continue
    const name = nameRaw.trim()
    // Strip surrounding backticks from the file path if present.
    const file = fileRaw.replace(/^`+|`+$/g, '').trim()
    const description = descRaw.trim()
    if (!name || !file) continue
    out.push({ name, file, description })
  }
  return out
}

/**
 * Read `<projectRoot>/agents/patterns/INDEX.md` and return the parsed index.
 * Returns `[]` if the file does not exist or cannot be read.
 */
export function loadPatternsIndex(
  projectRoot: string,
  logger?: Logger,
): PatternsIndex {
  if (!projectRoot || typeof projectRoot !== 'string') return []
  const indexPath = path.join(projectRoot, PATTERNS_INDEX_RELATIVE)
  if (!fs.existsSync(indexPath)) return []
  try {
    const raw = fs.readFileSync(indexPath, 'utf8')
    return parsePatternsIndex(raw)
  } catch (err) {
    logger?.warn(
      { err, indexPath },
      '[patterns] Failed to read agents/patterns/INDEX.md; returning empty index.',
    )
    return []
  }
}

/**
 * Render the patterns index into a compact prompt section so agents know
 * which pattern guides are available. Returns an empty string when the index
 * is empty (so the placeholder collapses cleanly).
 *
 * The output is intentionally small — only the pattern name, file path, and
 * description are listed. Agents are instructed to `read_files` the specific
 * pattern file on demand rather than having every pattern body injected.
 */
export function formatPatternsIndexPrompt(opts: {
  index: PatternsIndex
}): string {
  const { index } = opts
  if (index.length === 0) return ''
  const header = '## Patterns library\n'
  const intro =
    'Reusable task guides are available under `agents/patterns/`. ' +
    'When a task matches a pattern, `read_files` the specific pattern file ' +
    'before implementing. Do not load all patterns proactively.\n'
  const rows = index
    .map(
      (entry) =>
        `- \`${entry.name}\` → \`${entry.file}\` — ${entry.description}`,
    )
    .join('\n')
  return `${header}\n${intro}\n${rows}\n`
}
