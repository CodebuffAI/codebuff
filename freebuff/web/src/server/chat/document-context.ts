import { z } from 'zod/v4'

import {
  CHAT_DOC_HEAD_CHARS,
  CHAT_DOC_INLINE_CHAR_BUDGET,
  CHAT_DOC_SEARCH_TOTAL_CHAR_BUDGET,
} from '@/app/chat/models'
import { loadBlobs } from '@/server/chat/blob-store'
import { logger } from '@/util/logger'

import type { ChatDocumentRef } from '@/server/chat/store'
import type { CustomToolDefinition } from '@codebuff/sdk'

/** A document resolved to its extracted text, ready to inline or search. */
export interface LoadedDoc {
  name: string
  text: string
  truncated: boolean
  /** Lazily-cached line split, so repeated searches don't re-split the text. */
  lines?: string[]
}

export interface DocumentContext {
  /** Text appended to the user's prompt: the inlined files / head excerpts.
   *  Appended to the PROMPT (not the multimodal content array) because the SDK
   *  treats the first text content part as the user message and drops the
   *  prompt — so a doc placed in content would silently replace the user's
   *  question. Empty when there are no documents. */
  promptSuffix: string
  /** File-reading tools (search_files + read_file_lines) over the searchable
   *  files, present only when at least one file is too long to inline / is from
   *  an earlier message. Empty otherwise. */
  tools: CustomToolDefinition[]
  /** Guidance appended to the agent's instructions for this turn (e.g. telling
   *  it to use the file tools). Empty when there's nothing to add. */
  instructions: string
}

const EMPTY: DocumentContext = { promptSuffix: '', tools: [], instructions: '' }

/**
 * Makes a filename safe to embed in the model prompt. The name is user-supplied
 * (the original upload filename) and gets interpolated into an
 * `<attached_file name="...">` tag and the search tool description — so strip
 * characters that could break out of the tag/attribute or smuggle in fake
 * instructions (quotes, angle brackets, newlines, control chars), and bound the
 * length. This is prompt-injection hardening, not HTML escaping (the UI renders
 * the raw name through React, which escapes it).
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    // Control chars (incl. newlines) + tag/attribute breakout chars -> space.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned) || 'file'
}

/** Fetches each document's extracted text from the blob store (same resolve →
 *  fetch → skip-if-missing path as images, via loadBlobs). The name is
 *  sanitized here so every prompt-facing use (inline tag, tool description,
 *  search results) carries the safe name. */
function loadDocs(
  docs: ChatDocumentRef[],
  signal: AbortSignal,
): Promise<LoadedDoc[]> {
  return loadBlobs(docs, signal, async (res, doc) => ({
    name: sanitizeFileName(doc.name),
    text: await res.text(),
    truncated: doc.truncated,
  }))
}

/** Wraps a file's text in a delimiter the model can clearly attribute. */
function inlineBlock(name: string, text: string, note?: string): string {
  const attrs = note ? ` note="${note.replace(/"/g, "'")}"` : ''
  return `<attached_file name="${name}"${attrs}>\n${text}\n</attached_file>`
}

/**
 * Builds the per-turn document context.
 *
 * `currentDocs` are the files attached to THIS message: small ones are inlined
 * in full (into the prompt), large ones get a head excerpt. `priorDocs` are
 * files attached EARLIER in the same thread — they aren't re-inlined (that
 * would bloat every turn), but they're made searchable so a continued
 * conversation can still read/search previously-uploaded files. Their text is
 * loaded lazily (only if the agent actually searches), so prior files add no
 * latency to turns that don't touch them.
 *
 * A `search_files` tool is registered whenever there's anything searchable —
 * any current large file or any prior file — so a long file is searched, never
 * held whole in context. Returns EMPTY when there are no documents at all.
 */
export async function buildDocumentContext(
  currentDocs: ChatDocumentRef[],
  priorDocs: ChatDocumentRef[],
  signal: AbortSignal,
): Promise<DocumentContext> {
  if (currentDocs.length === 0 && priorDocs.length === 0) return EMPTY

  const loaded = currentDocs.length ? await loadDocs(currentDocs, signal) : []

  const inlinedBlocks: string[] = []
  const largeDocs: LoadedDoc[] = []
  let remaining = CHAT_DOC_INLINE_CHAR_BUDGET

  for (const doc of loaded) {
    if (doc.text.length <= remaining) {
      // Fits: inline the whole file.
      remaining -= doc.text.length
      const note = doc.truncated
        ? `This file was truncated to ${doc.text.length.toLocaleString()} characters.`
        : undefined
      inlinedBlocks.push(inlineBlock(doc.name, doc.text, note))
    } else {
      // Too long: inline only a head excerpt and make it searchable.
      const head = doc.text.slice(0, CHAT_DOC_HEAD_CHARS)
      largeDocs.push(doc)
      inlinedBlocks.push(
        inlineBlock(
          doc.name,
          head,
          `Showing the first ${head.length.toLocaleString()} of ${doc.text.length.toLocaleString()} characters. Use the search_files tool to find anything else in this file.`,
        ),
      )
    }
  }

  const largeNote =
    largeDocs.length > 0
      ? `\n\nNote: ${largeDocs.length === 1 ? 'one file is' : 'some files are'} too long to show in full — only a head excerpt appears above for ${largeDocs.length === 1 ? 'it' : 'those'}. Use the search_files tool to read the rest before answering.`
      : ''

  const promptSuffix = inlinedBlocks.length
    ? `The user attached the following file(s):\n\n${inlinedBlocks.join('\n\n')}${largeNote}`
    : ''

  // Don't re-search a file that's already a current attachment.
  const currentIds = new Set(currentDocs.map((d) => d.storageId))
  const lazyPriorDocs = priorDocs.filter((d) => !currentIds.has(d.storageId))

  // Searchable = current large files (text already loaded) + every prior file
  // (loaded lazily on first search).
  if (largeDocs.length === 0 && lazyPriorDocs.length === 0) {
    return {
      promptSuffix,
      tools: [],
      instructions:
        'The user attached file(s), included in full in their message. Use their contents directly when answering — do not ask the user to restate what they want.',
    }
  }

  // Both tools read from one lazily-hydrated source, so the prior files are
  // fetched at most once regardless of which tool the agent calls first.
  const source = makeDocSource(largeDocs, lazyPriorDocs, signal)
  return {
    promptSuffix,
    tools: [makeSearchTool(source), makeReadLinesTool(source)],
    instructions: `You can read the full text of file(s) attached in this conversation — including files attached in earlier messages — using two tools: search_files (find matching line ranges by keyword/identifier/phrase) and read_file_lines (read a specific numbered line range, e.g. to see more context around a search hit). Only a head excerpt of long files is shown inline. Whenever the user's message is about an attached file, use these tools to find what you need before answering, rather than relying only on an inline excerpt or asking the user to restate. You may call them several times.`,
  }
}

/** A lazily-hydrated set of searchable documents shared by the file tools.
 *  Already-loaded files (this turn's large files) are available immediately;
 *  files from earlier messages are fetched on first access, keeping the
 *  most-recent ones up to a total-size budget so a thread with many/large files
 *  can't exhaust memory. */
interface DocSource {
  /** Display names of every searchable file (for tool descriptions). */
  names: string[]
  /** All hydrated docs; fetches the lazy ones on first call, then caches. */
  all: () => Promise<LoadedDoc[]>
}

function makeDocSource(
  loaded: LoadedDoc[],
  lazyRefs: ChatDocumentRef[],
  signal: AbortSignal,
): DocSource {
  const docs: LoadedDoc[] = [...loaded]
  let pending: ChatDocumentRef[] = [...lazyRefs]
  return {
    names: [
      ...loaded.map((d) => d.name),
      ...lazyRefs.map((r) => sanitizeFileName(r.name)),
    ],
    all: async () => {
      if (pending.length > 0) {
        const more = await loadDocs(pending, signal)
        pending = []
        let total = docs.reduce((n, d) => n + d.text.length, 0)
        for (const d of more) {
          if (total + d.text.length > CHAT_DOC_SEARCH_TOTAL_CHAR_BUDGET) continue
          docs.push(d)
          total += d.text.length
        }
      }
      return docs
    },
  }
}

/** doc.lines, split once and cached for reuse across tool calls. */
function docLines(doc: LoadedDoc): string[] {
  return (doc.lines ??= doc.text.split('\n'))
}

/** Resolves a model-supplied file name to a loaded doc (exact, then
 *  case-insensitive, then basename match), or null if not found/ambiguous. */
function findDoc(docs: LoadedDoc[], name: string): LoadedDoc | null {
  const exact = docs.find((d) => d.name === name)
  if (exact) return exact
  const lower = name.toLowerCase()
  const ci = docs.filter((d) => d.name.toLowerCase() === lower)
  if (ci.length === 1) return ci[0]!
  const base = docs.filter((d) => d.name.toLowerCase().endsWith(`/${lower}`))
  return base.length === 1 ? base[0]! : null
}

const MAX_SEARCH_RESULTS = 25
const SEARCH_CONTEXT_LINES = 3
const MAX_SEARCH_OUTPUT_CHARS = 12_000
// ReDoS hardening for the model-supplied `isRegex` path. Backtracking blows up
// with input length and pattern complexity, so we bound both: a long pattern
// falls back to a literal substring match, each line is tested only up to a
// length cap, and the whole search is abandoned past a wall-clock budget.
const MAX_REGEX_QUERY_LENGTH = 200
const MAX_LINE_TEST_CHARS = 5_000
const SEARCH_TIME_BUDGET_MS = 1_500

interface SearchMatch {
  file: string
  startLine: number
  endLine: number
  snippet: string
}

/** Greps the given docs for a query, returning matching line windows with
 *  surrounding context. Runs in-process in the chat server (the doc text is
 *  already in memory), so the model never has to ingest the whole file.
 *  Exported for unit testing. */
export function searchDocs(
  docs: LoadedDoc[],
  query: string,
  isRegex: boolean,
): { matches: SearchMatch[]; totalMatches: number; truncated: boolean } {
  // Only honor a regex if it's short enough to be safe; otherwise fall back to
  // a literal substring match (never feed a long model-supplied pattern to the
  // backtracking engine).
  let re: RegExp | null = null
  if (isRegex && query.length <= MAX_REGEX_QUERY_LENGTH) {
    try {
      re = new RegExp(query, 'i')
    } catch {
      re = null
    }
  }
  let matcher: (line: string) => boolean
  if (re) {
    const compiled = re
    // Cap the input length per test so a single pathological line can't make
    // backtracking run away.
    matcher = (line) =>
      compiled.test(
        line.length > MAX_LINE_TEST_CHARS
          ? line.slice(0, MAX_LINE_TEST_CHARS)
          : line,
      )
  } else {
    const needle = query.toLowerCase()
    matcher = (line) => line.toLowerCase().includes(needle)
  }

  const matches: SearchMatch[] = []
  let totalMatches = 0
  let outputChars = 0
  let truncated = false
  const deadline = Date.now() + SEARCH_TIME_BUDGET_MS

  outer: for (const doc of docs) {
    // Split once per doc and reuse across the turn's repeated search calls.
    const lines = (doc.lines ??= doc.text.split('\n'))
    let lastEmitted = -1
    for (let i = 0; i < lines.length; i++) {
      // Abandon the search if it's taking too long (checked cheaply, not every
      // line). Returns whatever matched so far, flagged truncated.
      if ((i & 0x3ff) === 0 && Date.now() > deadline) {
        truncated = true
        break outer
      }
      if (!matcher(lines[i]!)) continue
      totalMatches++
      if (matches.length >= MAX_SEARCH_RESULTS || truncated) continue
      const start = Math.max(0, i - SEARCH_CONTEXT_LINES)
      const end = Math.min(lines.length - 1, i + SEARCH_CONTEXT_LINES)
      // Merge into the previous window if they overlap (avoids dupes for
      // clustered matches).
      if (matches.length > 0) {
        const prev = matches[matches.length - 1]!
        if (prev.file === doc.name && start <= prev.endLine + 1) {
          const newEnd = Math.max(prev.endLine, end)
          const merged = lines
            .slice(prev.startLine - 1, newEnd)
            .map((l, idx) => `${prev.startLine + idx}: ${l}`)
            .join('\n')
          outputChars += merged.length - prev.snippet.length
          prev.endLine = newEnd
          prev.snippet = merged
          lastEmitted = newEnd
          if (outputChars > MAX_SEARCH_OUTPUT_CHARS) truncated = true
          continue
        }
      }
      if (start <= lastEmitted) continue
      const snippet = lines
        .slice(start, end + 1)
        .map((l, idx) => `${start + 1 + idx}: ${l}`)
        .join('\n')
      outputChars += snippet.length
      matches.push({
        file: doc.name,
        startLine: start + 1,
        endLine: end + 1,
        snippet,
      })
      lastEmitted = end
      if (outputChars > MAX_SEARCH_OUTPUT_CHARS) truncated = true
    }
  }

  return { matches, totalMatches, truncated }
}

/** Default span and hard caps for read_file_lines. */
const READ_DEFAULT_LINES = 200
const MAX_READ_LINES = 400
const MAX_READ_OUTPUT_CHARS = 12_000

/**
 * search_files: greps the searchable files for a query and returns matching
 * line ranges with surrounding context. The files come from a shared DocSource,
 * so earlier-message files are fetched at most once across both file tools.
 */
function makeSearchTool(source: DocSource): CustomToolDefinition {
  const fileList = source.names.join(', ')
  return {
    toolName: 'search_files',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe('Text or identifier to search for (case-insensitive).'),
      isRegex: z
        .boolean()
        .optional()
        .describe('Treat query as a JavaScript regular expression.'),
    }),
    description: `Search the full text of the attached file(s) (${fileList}) for a query and return matching line ranges with surrounding context. Files attached earlier in this conversation are included. Use this to find parts of a file that aren't in any inline excerpt; pair it with read_file_lines to read more around a hit. Call it multiple times with different queries as needed.`,
    endsAgentStep: true,
    exampleInputs: [{ query: 'function handleUpload' }, { query: 'TODO' }],
    execute: async (input: { query: string; isRegex?: boolean }) => {
      const docs = await source.all()
      const { matches, totalMatches, truncated } = searchDocs(
        docs,
        input.query,
        input.isRegex ?? false,
      )
      logger.info(
        {
          metric: 'chat_doc_search',
          files: docs.length,
          queryLen: input.query.length,
          isRegex: input.isRegex ?? false,
          totalMatches,
          returned: matches.length,
          truncated,
        },
        'chat document search',
      )
      if (matches.length === 0) {
        return [
          {
            type: 'json',
            value: {
              query: input.query,
              totalMatches: 0,
              message:
                'No matches found. Try a shorter or different query, a regular expression, or read_file_lines if you know the region.',
            },
          },
        ]
      }
      return [
        {
          type: 'json',
          value: {
            query: input.query,
            totalMatches,
            returned: matches.length,
            truncated,
            matches: matches.map((m) => ({
              file: m.file,
              lines: `${m.startLine}-${m.endLine}`,
              snippet: m.snippet,
            })),
          },
        },
      ]
    },
  }
}

/**
 * read_file_lines: returns a numbered range of lines from one attached file —
 * the complement to search_files, letting the agent expand context around a
 * match or read a known region. The range is clamped to the file and to
 * MAX_READ_LINES / MAX_READ_OUTPUT_CHARS.
 */
function makeReadLinesTool(source: DocSource): CustomToolDefinition {
  const fileList = source.names.join(', ')
  return {
    toolName: 'read_file_lines',
    inputSchema: z.object({
      file: z
        .string()
        .min(1)
        .describe('Name of the attached file to read from.'),
      startLine: z
        .number()
        .int()
        .min(1)
        .describe('First line to read (1-based, inclusive).'),
      endLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          `Last line to read (inclusive). Defaults to startLine + ${READ_DEFAULT_LINES - 1}; at most ${MAX_READ_LINES} lines are returned.`,
        ),
    }),
    description: `Read a numbered range of lines from one attached file (${fileList}). Use after search_files to see more context around a match, or to read a specific region of a long file. Returns the lines with their numbers.`,
    endsAgentStep: true,
    exampleInputs: [{ file: source.names[0] ?? 'file', startLine: 1, endLine: 40 }],
    execute: async (input: {
      file: string
      startLine: number
      endLine?: number
    }) => {
      const docs = await source.all()
      const doc = findDoc(docs, input.file)
      if (!doc) {
        logger.info(
          { metric: 'chat_doc_read_lines', found: false },
          'chat document read_lines',
        )
        return [
          {
            type: 'json',
            value: {
              error: `File "${input.file}" not found.`,
              availableFiles: source.names,
            },
          },
        ]
      }
      const lines = docLines(doc)
      const totalLines = lines.length
      const start = Math.min(Math.max(1, input.startLine), totalLines)
      const requestedEnd = input.endLine ?? start + READ_DEFAULT_LINES - 1
      let end = Math.min(Math.max(start, requestedEnd), totalLines)
      // Cap the number of lines, then the output chars (truncating the tail).
      end = Math.min(end, start + MAX_READ_LINES - 1)
      let chars = 0
      const out: string[] = []
      for (let i = start; i <= end; i++) {
        const rendered = `${i}: ${lines[i - 1]!}`
        if (chars + rendered.length > MAX_READ_OUTPUT_CHARS && out.length > 0) {
          end = i - 1
          break
        }
        out.push(rendered)
        chars += rendered.length + 1
      }
      const clamped = end < requestedEnd || start !== input.startLine
      logger.info(
        {
          metric: 'chat_doc_read_lines',
          found: true,
          totalLines,
          returnedLines: out.length,
          clamped,
        },
        'chat document read_lines',
      )
      return [
        {
          type: 'json',
          value: {
            file: doc.name,
            startLine: start,
            endLine: end,
            totalLines,
            content: out.join('\n'),
          },
        },
      ]
    },
  }
}
