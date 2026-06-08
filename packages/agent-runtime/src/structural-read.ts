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
  } catch {
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
