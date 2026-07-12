import {
  encodeReadCapabilityToken,
  getContentHash,
} from './process-str-replace'

import type { SymbolRange } from '@codebuff/code-map'

/**
 * Tree-sitter-backed structural extraction for the read_outline / read_slices
 * tools, shared so both tools behave identically across languages.
 *
 * code-map is imported dynamically: its module top-level constructs a
 * tree-sitter loader and kicks off WASM init, which we do NOT want to trigger
 * at agent-runtime load time (e.g. in environments that never call these
 * tools). A failed import or parse degrades gracefully to `null`, letting the
 * caller fall back to a regex heuristic.
 */
export async function getFileStructure(
  content: string,
  filePath: string,
): Promise<SymbolRange[] | null> {
  try {
    const { parseFileStructure } = await import('@codebuff/code-map')
    return await parseFileStructure(content, filePath)
  } catch (err) {
    // Degrade gracefully to null (caller falls back to regex heuristic), but
    // surface the failure so a broken code-map install doesn't silently drop
    // structural reads for the whole session.
    console.debug(
      `[structural-read] getFileStructure failed for ${filePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

/** Imports/includes/module lines worth surfacing in an outline header. */
const IMPORT_LINE_REGEX =
  /^\s*(?:import\b|from\s+\S+\s+import\b|export\s+\{|export\s+\*|const\s+\w+\s*=\s*require\(|require\s|use\s+\w|#include\b|using\s+\w|package\s+\w|namespace\s+\w)/

export function extractImportLines(
  content: string,
  limit = 60,
): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.length === 0) continue
    if (IMPORT_LINE_REGEX.test(lines[i])) {
      out.push({ line: i + 1, text: trimmed })
    }
  }
  return out
}

// Extend a symbol's 1-indexed start line upward to include a contiguous,
// immediately-preceding comment block (JSDoc slash-star block, block comment,
// or consecutive slash-slash line comments). Stops at the first blank line or
// non-comment line, and only extends when the comment block is directly
// adjacent to the symbol (no blank-line gap). Returns the adjusted start line
// (unchanged if there is no preceding comment block).
//
// Used by rewrite_symbol so the old doc-block is replaced atomically with the
// symbol, avoiding orphan/duplicate JSDoc blocks that would shift line numbers
// and invalidate cached anchors on subsequent edits.
export function extendRangeToPrecedingComment(
  lines: string[],
  symbolStartLine: number,
): { startLine: number; commentPrefix: string } {
  // The line immediately preceding the symbol (1-indexed → 0-indexed).
  const prevIdx = symbolStartLine - 2
  if (prevIdx < 0) return { startLine: symbolStartLine, commentPrefix: '' }

  const prevLine = lines[prevIdx]

  // Case 1: preceding line ends a block/JSDoc comment (`*/`). Walk upward to
  // find the matching opener `/*`, requiring no blank line in between.
  if (/\*\/\s*$/.test(prevLine)) {
    let openerIdx = prevIdx
    let foundOpen = false
    while (openerIdx >= 0) {
      const line = lines[openerIdx]
      if (openerIdx !== prevIdx && line.trim() === '') {
        // Blank line between opener and closer → not contiguous.
        return { startLine: symbolStartLine, commentPrefix: '' }
      }
      if (line.includes('/*') && !/^\s*\*\//.test(line)) {
        foundOpen = true
        break
      }
      openerIdx--
    }
    if (foundOpen) {
      const blockLines = lines.slice(openerIdx, prevIdx + 1)
      return {
        startLine: openerIdx + 1,
        commentPrefix: blockLines.join('\n') + '\n',
      }
    }
  }

  // Case 2: preceding line is a `//` line comment. Grab the contiguous run.
  if (/^\s*\/\//.test(prevLine)) {
    let runStart = prevIdx
    while (runStart - 1 >= 0 && /^\s*\/\//.test(lines[runStart - 1])) {
      runStart--
    }
    const runLines = lines.slice(runStart, prevIdx + 1)
    return {
      startLine: runStart + 1,
      commentPrefix: runLines.join('\n') + '\n',
    }
  }

  return { startLine: symbolStartLine, commentPrefix: '' }
}

/**
 * Mint a read capability token for a 1-indexed inclusive line range, using the
 * exact same LF-normalization + hashing as read_files / str_replace so the
 * token validates identically when later passed as basedOnRead on an edit.
 */
export function mintSliceCapability(params: {
  content: string
  startLine: number
  endLine: number
}): { readCapability: string; rangeHash: string; sliceContent: string } {
  const { content, startLine, endLine } = params
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const start = Math.max(1, startLine)
  const end = Math.min(lines.length, Math.max(start, endLine))
  const sliceContent = lines.slice(start - 1, end).join('\n')
  const rangeHash = getContentHash(sliceContent)
  return {
    readCapability: encodeReadCapabilityToken({
      startLine: start,
      endLine: end,
      hash: rangeHash,
    }),
    rangeHash,
    sliceContent,
  }
}

/** Render a tree-sitter structure list into a compact, indented outline. */
export function renderStructureOutline(
  content: string,
  symbols: SymbolRange[],
): string {
  const importLines = extractImportLines(content)
  const lines: string[] = []
  for (const imp of importLines) {
    lines.push(`Line ${imp.line}: ${imp.text}`)
  }
  if (importLines.length > 0 && symbols.length > 0) lines.push('')
  for (const sym of symbols) {
    const indent = '  '.repeat(sym.depth)
    const span =
      sym.startLine === sym.endLine
        ? `Line ${sym.startLine}`
        : `Lines ${sym.startLine}-${sym.endLine}`
    lines.push(`${indent}${span}: ${sym.kind} ${sym.name}`)
  }
  return lines.join('\n')
}

export type ExtractedSlice = {
  symbol: string
  kind?: string
  content: string
  startLine: number
  endLine: number
  readCapability?: string
}

const DEFAULT_MAX_MATCHES_PER_SYMBOL = 5

/**
 * Extract code slices for the given symbol names from a file's raw content,
 * preferring tree-sitter structure and falling back to a regex heuristic for
 * unparseable files or symbols the parser doesn't surface. Parser-proven
 * declarations carry an edit capability; heuristic slices are read-only and
 * require an exact range read before editing.
 *
 * Shared by read_files (symbols mode) and the deprecated read_slices alias.
 */
export async function extractSlices(
  rawContent: string,
  filePath: string,
  symbols: string[],
  maxMatchesPerSymbol: number = DEFAULT_MAX_MATCHES_PER_SYMBOL,
): Promise<ExtractedSlice[]> {
  const slices: ExtractedSlice[] = []
  const structure = await getFileStructure(rawContent, filePath)

  for (const symbol of symbols) {
    const astMatches =
      structure
        ?.filter((s) => s.name === symbol)
        .slice(0, maxMatchesPerSymbol) ?? []

    if (astMatches.length > 0) {
      for (const match of astMatches) {
        const { readCapability, sliceContent } = mintSliceCapability({
          content: rawContent,
          startLine: match.startLine,
          endLine: match.endLine,
        })
        slices.push({
          symbol,
          kind: match.kind,
          content: sliceContent,
          startLine: match.startLine,
          endLine: match.endLine,
          readCapability,
        })
      }
      continue
    }

    const fallback = regexSlice(rawContent, symbol, filePath)
    if (fallback) {
      const lines = rawContent.replace(/\r\n/g, '\n').split('\n')
      const sliceContent = lines
        .slice(fallback.startLine - 1, fallback.endLine)
        .join('\n')
      slices.push({
        symbol,
        content: sliceContent,
        startLine: fallback.startLine,
        endLine: fallback.endLine,
      })
    }
  }

  return slices
}

/**
 * Heuristic single-symbol slicer used only when tree-sitter cannot provide a
 * range. Returns a 1-indexed inclusive line span or null. Brace-based for
 * C-family languages, indentation-based for Python.
 *
 * Brace counting is done over a string/comment-stripped projection so braces
 * inside `"…{ }…"`, `'…'`, template literals, `/* … *\/`, and `// …` comments
 * do not skew the count. Without this, code like `console.log("}")` or block
 * comments containing `{` could close the symbol body early (or never).
 */
function regexSlice(
  rawContent: string,
  symbol: string,
  filePath: string,
): { startLine: number; endLine: number } | null {
  const lines = rawContent.split(/\r?\n/)
  const isPython = filePath.endsWith('.py')
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const symbolRegex = new RegExp(`\\b${escaped}\\b`)

  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (symbolRegex.test(lines[i])) {
      const line = lines[i]
      if (
        /\b(function|class|const|let|var|def|interface|type|struct|fn|func)\b/.test(
          line,
        ) ||
        /^\s*(?:(?:public|private|protected|static|async|export)\s+)*[A-Za-z_$][\w$]*\s*\([^;]*\)\s*(?::[^={]+)?\s*[{:]\s*$/.test(
          line,
        )
      ) {
        startLine = i
        break
      }
    }
  }
  if (startLine === -1) return null

  let endLine = startLine
  if (isPython) {
    const startIndent =
      lines[startLine].length - lines[startLine].trimStart().length
    for (let j = startLine + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim()
      if (trimmed.length === 0) {
        endLine = j
        continue
      }
      const indent = lines[j].length - lines[j].trimStart().length
      if (indent <= startIndent) break
      endLine = j
    }
  } else {
    // Project each line onto a brace-only view by stripping strings, template
    // literals, and comments so quoted/commented braces don't move the count.
    let braceCount = 0
    let foundBrace = false
    let inBlockComment = false
    for (let j = startLine; j < lines.length; j++) {
      const stripped = stripStringsAndComments(lines[j], inBlockComment)
      inBlockComment = stripped.endedInBlockComment
      for (const char of stripped.text) {
        if (char === '{') {
          braceCount++
          foundBrace = true
        } else if (char === '}') {
          braceCount--
        }
      }
      endLine = j
      if (foundBrace && braceCount <= 0) break
    }
  }

  return { startLine: startLine + 1, endLine: endLine + 1 }
}

/**
 * Project a source line onto a string/comment-free view used for brace
 * counting in `regexSlice`. Tracks whether the line ends still inside a
 * `/* … *\/` block comment so the caller can carry that state forward.
 *
 * Handled lexical contexts:
 *  - double-quoted strings (with `\"` escape)
 *  - single-quoted strings (with `\'` escape)
 *  - template literals (backtick, with `\`` escape; does NOT recurse into
 *    `${…}` interpolations, which is a conservative approximation but still
 *    drops the literal text correctly)
 *  - line comments `// …` (rest of line is dropped)
 *  - block comments `/* … *\/` (across lines via `startsInBlockComment`)
 */
function stripStringsAndComments(
  line: string,
  startsInBlockComment: boolean,
): { text: string; endedInBlockComment: boolean } {
  let out = ''
  let inBlock = startsInBlockComment
  let i = 0
  while (i < line.length) {
    if (inBlock) {
      const close = line.indexOf('*/', i)
      if (close === -1) {
        return { text: out, endedInBlockComment: true }
      }
      i = close + 2
      inBlock = false
      continue
    }
    const ch = line[i]
    const next = line[i + 1]
    if (ch === '/' && next === '*') {
      inBlock = true
      i += 2
      continue
    }
    if (ch === '/' && next === '/') {
      // Rest of line is a comment.
      return { text: out, endedInBlockComment: false }
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      i++
      while (i < line.length) {
        const c = line[i]
        if (c === '\\') {
          i += 2
          continue
        }
        if (c === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    out += ch
    i++
  }
  return { text: out, endedInBlockComment: inBlock }
}
