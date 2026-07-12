// Pre-flight syntax validation for edit tools (str_replace, write_file,
// edit_transaction, apply_smart_patch). Catches syntax errors BEFORE dependent
// edits stack on top of a broken file — today a malformed edit can cascade into
// 5 more edits before the validation gate catches it.
//
// This module is the single source of truth for syntax preflight. Previously
// apply-smart-patch.ts had the full implementation (JS/TS + Python + Go) while
// edit-transaction.ts had a minimal JS/TS-only inline copy. str_replace and
// write_file had no preflight at all. This module consolidates all four onto
// one implementation.
//
// Bun.Transpiler is only available in the Bun runtime. In Node.js it is
// undefined, so `new Bun.Transpiler(...)` would throw a ReferenceError. The
// JS/TS validation path guards on `typeof Bun !== 'undefined'` and skips
// preflight in Node (the client-side apply still catches real syntax errors).

declare const Bun: {
  Transpiler: new (options: { loader: BunTranspilerLoader }) => {
    transformSync: (content: string) => string
  }
}

type BunTranspilerLoader = 'js' | 'jsx' | 'ts' | 'tsx'

export type SyntaxValidationResult = { valid: boolean; message: string }

// Module-level cache for Bun.Transpiler instances. Each loader (js/jsx/ts/tsx)
// gets its own transpiler, reused across calls instead of allocating a fresh
// one per validateJavaScriptLikeSyntax invocation.
const transpilerCache = new Map<
  BunTranspilerLoader,
  { transformSync: (content: string) => string }
>()

function getTranspiler(loader: BunTranspilerLoader) {
  let transpiler = transpilerCache.get(loader)
  if (!transpiler) {
    transpiler = new Bun.Transpiler({ loader })
    transpilerCache.set(loader, transpiler)
  }
  return transpiler
}

type PythonLineState = {
  delimiterDepthBeforeLine: number
  inTripleQuoteBeforeLine: boolean
}

/**
 * Maps a file path to a Bun.Transpiler loader, or null if the file is not a
 * JS/TS/JSX/TSX file.
 *
 * Exported for direct unit testing of the loader mapping; production code
 * calls it indirectly via `validateJavaScriptLikeSyntax`.
 */
export function getBunTranspilerLoader(
  path: string,
): BunTranspilerLoader | null {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.jsx')) return 'jsx'
  if (path.endsWith('.ts')) return 'ts'
  if (path.endsWith('.js')) return 'js'
  return null
}

export function isJavaScriptLikePath(path: string): boolean {
  return /\.(?:ts|tsx|js|jsx)$/.test(path)
}

/**
 * Entry point for preflight syntax validation. Dispatches to the appropriate
 * language validator based on file extension. Returns { valid: true } when the
 * content passes syntax validation (or when no validator applies to the file
 * type), or { valid: false, message } when a syntax error is detected.
 */
export function preflightValidateSyntax(
  path: string,
  content: string,
): SyntaxValidationResult {
  if (isJavaScriptLikePath(path)) {
    return validateJavaScriptLikeSyntax(path, content)
  }
  if (path.endsWith('.py')) {
    return validatePythonSyntax(content)
  }
  if (path.endsWith('.go')) {
    return validateGoSyntax(content)
  }

  return { valid: true, message: 'No syntax validation needed for this file.' }
}

/**
 * Formats a preflight failure error message for a given tool. Used by the
 * str_replace, write_file, edit_transaction, and apply_smart_patch handlers to
 * produce consistent recovery guidance when preflight rejects an edit.
 */
export function formatPreflightErrorMessage(
  toolName:
    | 'str_replace'
    | 'write_file'
    | 'edit_transaction'
    | 'apply_smart_patch',
  path: string,
  syntaxMessage: string,
): string {
  const toolSpecificGuidance =
    toolName === 'edit_transaction'
      ? 'NO files were changed. Do NOT resubmit the same edit_transaction; it will fail the same way.\nFor import changes specifically, prefer structured insert_import/remove_import operations instead of rewriting an entire import block — generated multi-import rewrites are the most common cause of this error (e.g. an `import { ... }` left without a valid `from "..."`).'
      : toolName === 'apply_smart_patch'
        ? 'The smart patch was NOT written to disk. Do NOT resubmit the same patch; it will fail the same way.'
        : 'The edit was NOT written to disk. Do NOT resubmit the same edit; it will fail the same way.'

  return [
    `Preflight Syntax Validation Failed: ${toolName} rejected due to syntax error in ${path}: ${syntaxMessage}`,
    toolSpecificGuidance,
    `Recovery: the current file remains unchanged. Correct or rebuild the candidate content against the current ${path}, then submit a small targeted edit.`,
  ].join('\n')
}

function getPythonIndentColumns(leadingWhitespace: string): number {
  let columns = 0
  for (const character of leadingWhitespace) {
    columns = character === '\t' ? columns + (8 - (columns % 8)) : columns + 1
  }
  return columns
}

function validateJavaScriptLikeSyntax(
  path: string,
  content: string,
): SyntaxValidationResult {
  if (typeof Bun === 'undefined' || !Bun?.Transpiler) {
    return {
      valid: true,
      message:
        'JavaScript/TypeScript syntax validation skipped (Bun.Transpiler unavailable in Node).',
    }
  }
  try {
    const loader = getBunTranspilerLoader(path) ?? 'ts'
    const transpiler = getTranspiler(loader)
    transpiler.transformSync(content)
    return { valid: true, message: 'JavaScript/TypeScript syntax passed.' }
  } catch (err: any) {
    return { valid: false, message: err.message || String(err) }
  }
}

function validatePythonSyntax(content: string): SyntaxValidationResult {
  const parenValidation = validateBalancedDelimiters(content, 'python')
  if (!parenValidation.valid) return parenValidation

  const lines = content.split(/\r?\n/)
  const lineStates = getPythonLineStates(lines)
  const indentStack = [0]

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const lineState = lineStates[index]
    if (
      lineState?.inTripleQuoteBeforeLine ||
      lineState?.delimiterDepthBeforeLine > 0
    ) {
      continue
    }

    const leadingWhitespace = line.match(/^\s*/)?.[0] ?? ''
    const indent = getPythonIndentColumns(leadingWhitespace)
    const previousIndent = indentStack[indentStack.length - 1]
    if (indent > previousIndent) {
      const previousCodeLine = findPreviousPythonCodeLine(
        lines,
        lineStates,
        index,
      )
      if (!previousCodeLine?.trimEnd().endsWith(':')) {
        return {
          valid: false,
          message: `Python indentation increases at line ${index + 1} without a preceding block colon.`,
        }
      }
      indentStack.push(indent)
    } else {
      while (indent < indentStack[indentStack.length - 1]) {
        indentStack.pop()
      }
      if (indent !== indentStack[indentStack.length - 1]) {
        return {
          valid: false,
          message: `Python indentation at line ${index + 1} does not match any open block.`,
        }
      }
    }

    const codeWithoutComment = stripPythonComment(line)
    if (opensPythonBlock(line) && !codeWithoutComment.includes(':')) {
      return {
        valid: false,
        message: `Python block opener at line ${index + 1} must include ':'.`,
      }
    }
    if (codeWithoutComment.trimEnd().endsWith(':')) {
      const nextCodeLine = findNextPythonCodeLine(lines, lineStates, index)
      if (!nextCodeLine) {
        return {
          valid: false,
          message: `Python block opener at line ${index + 1} has no body.`,
        }
      }
      const nextIndent = getPythonIndentColumns(
        nextCodeLine.match(/^\s*/)?.[0] ?? '',
      )
      if (nextIndent <= indent) {
        return {
          valid: false,
          message: `Python block opener at line ${index + 1} must be followed by an indented body.`,
        }
      }
    }
  }

  return { valid: true, message: 'Python structural syntax passed.' }
}

function validateGoSyntax(content: string): SyntaxValidationResult {
  const delimiterValidation = validateBalancedDelimiters(content, 'go')
  if (!delimiterValidation.valid) return delimiterValidation

  const lines = content.split(/\r?\n/)
  const packageLineIndex = lines.findIndex((line) =>
    /^\s*package\s+[A-Za-z_]\w*\s*$/.test(line),
  )
  if (packageLineIndex === -1) {
    return {
      valid: false,
      message: 'Go files must include a valid package declaration.',
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const line = stripGoLineComment(lines[index]).trim()
    if (!line) continue
    if (/^\s*import\s*\($/.test(line)) {
      continue
    }
    if (isGoBlockStatementMissingOpeningBrace(lines, index)) {
      return {
        valid: false,
        message: `Go block statement at line ${index + 1} should include an opening '{'.`,
      }
    }
    if (line.includes('} else') && !line.includes('{')) {
      return {
        valid: false,
        message: `Go else block at line ${index + 1} should include an opening '{'.`,
      }
    }
  }

  return { valid: true, message: 'Go structural syntax passed.' }
}

function validateBalancedDelimiters(
  content: string,
  language: 'javascript' | 'python' | 'go',
): SyntaxValidationResult {
  const counts = countDelimitersOutsideStringsAndComments(content, language)
  if (counts.openBraces !== counts.closeBraces) {
    return {
      valid: false,
      message: `Unbalanced curly braces: ${counts.openBraces} opening and ${counts.closeBraces} closing.`,
    }
  }
  if (counts.openParens !== counts.closeParens) {
    return {
      valid: false,
      message: `Unbalanced parentheses: ${counts.openParens} opening and ${counts.closeParens} closing.`,
    }
  }
  if (counts.openBrackets !== counts.closeBrackets) {
    return {
      valid: false,
      message: `Unbalanced square brackets: ${counts.openBrackets} opening and ${counts.closeBrackets} closing.`,
    }
  }

  return { valid: true, message: 'Balanced delimiters.' }
}

export function countDelimitersOutsideStringsAndComments(
  content: string,
  language: 'javascript' | 'python' | 'go',
): {
  openBraces: number
  closeBraces: number
  openParens: number
  closeParens: number
  openBrackets: number
  closeBrackets: number
} {
  let openBraces = 0
  let closeBraces = 0
  let openParens = 0
  let closeParens = 0
  let openBrackets = 0
  let closeBrackets = 0
  let quote: string | undefined
  let tripleQuote: string | undefined
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < content.length; index++) {
    const char = content[index]
    const nextChar = content[index + 1]
    const nextThree = content.slice(index, index + 3)

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false
        index++
      }
      continue
    }

    if (tripleQuote) {
      if (nextThree === tripleQuote) {
        tripleQuote = undefined
        index += 2
      }
      continue
    }

    if (quote) {
      if (char === quote && content[index - 1] !== '\\') quote = undefined
      continue
    }

    if (language === 'python' && (nextThree === "'''" || nextThree === '"""')) {
      tripleQuote = nextThree
      index += 2
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }

    if (language !== 'python' && char === '/' && nextChar === '/') {
      inLineComment = true
      index++
      continue
    }
    if (language !== 'python' && char === '/' && nextChar === '*') {
      inBlockComment = true
      index++
      continue
    }
    if (language === 'python' && char === '#') {
      inLineComment = true
      continue
    }

    if (char === '{') openBraces++
    else if (char === '}') closeBraces++
    else if (char === '(') openParens++
    else if (char === ')') closeParens++
    else if (char === '[') openBrackets++
    else if (char === ']') closeBrackets++
  }

  return {
    openBraces,
    closeBraces,
    openParens,
    closeParens,
    openBrackets,
    closeBrackets,
  }
}

function getPythonLineStates(lines: string[]): PythonLineState[] {
  const states: PythonLineState[] = []
  let delimiterDepth = 0
  let quote: string | undefined
  let tripleQuote: string | undefined

  for (const line of lines) {
    states.push({
      delimiterDepthBeforeLine: delimiterDepth,
      inTripleQuoteBeforeLine: Boolean(tripleQuote),
    })

    for (let index = 0; index < line.length; index++) {
      const char = line[index]
      const nextThree = line.slice(index, index + 3)

      if (tripleQuote) {
        if (nextThree === tripleQuote) {
          tripleQuote = undefined
          index += 2
        }
        continue
      }

      if (quote) {
        if (char === quote && line[index - 1] !== '\\') quote = undefined
        continue
      }

      if (nextThree === "'''" || nextThree === '"""') {
        tripleQuote = nextThree
        index += 2
        continue
      }

      if (char === "'" || char === '"') {
        quote = char
        continue
      }

      if (char === '#') break

      if (char === '(' || char === '[' || char === '{') delimiterDepth++
      else if (char === ')' || char === ']' || char === '}') {
        delimiterDepth = Math.max(0, delimiterDepth - 1)
      }
    }

    quote = undefined
  }

  return states
}

function findPreviousPythonCodeLine(
  lines: string[],
  lineStates: PythonLineState[],
  currentIndex: number,
): string | undefined {
  for (let index = currentIndex - 1; index >= 0; index--) {
    const line = lines[index]
    const state = lineStates[index]
    if (
      line.trim() &&
      !line.trimStart().startsWith('#') &&
      !state?.inTripleQuoteBeforeLine &&
      state?.delimiterDepthBeforeLine === 0
    ) {
      return line
    }
  }
  return undefined
}

function findNextPythonCodeLine(
  lines: string[],
  lineStates: PythonLineState[],
  currentIndex: number,
): string | undefined {
  for (let index = currentIndex + 1; index < lines.length; index++) {
    const line = lines[index]
    const state = lineStates[index]
    if (
      line.trim() &&
      !line.trimStart().startsWith('#') &&
      !state?.inTripleQuoteBeforeLine &&
      state?.delimiterDepthBeforeLine === 0
    ) {
      return line
    }
  }
  return undefined
}

function opensPythonBlock(line: string): boolean {
  return /^\s*(?:if|elif|else|for|while|try|except|finally|with|def|class|async\s+def|async\s+with|async\s+for)\b/.test(
    line,
  )
}

function stripPythonComment(line: string): string {
  return stripCommentOutsideStrings(line, '#')
}

function stripGoLineComment(line: string): string {
  return stripCommentOutsideStrings(line, '//')
}

function isGoBlockStatementMissingOpeningBrace(
  lines: string[],
  startIndex: number,
): boolean {
  const firstLine = stripGoLineComment(lines[startIndex]).trim()
  if (!/^\s*(?:func(?:\s|\()|if\b|for\b|switch\b|select\b)/.test(firstLine)) {
    return false
  }

  let delimiterDepth = 0
  for (let index = startIndex; index < lines.length; index++) {
    const line = stripGoLineComment(lines[index]).trim()
    if (!line) continue

    if (
      index > startIndex &&
      /^\s*(?:func|if|for|switch|select)\b/.test(line)
    ) {
      return true
    }

    for (const char of line) {
      if (char === '{') return false
      if (char === '(' || char === '[') delimiterDepth++
      else if (char === ')' || char === ']') {
        delimiterDepth = Math.max(0, delimiterDepth - 1)
      }
    }

    if (delimiterDepth === 0 && index > startIndex && !/[,(]$/.test(line)) {
      const nextLine = findNextNonEmptyGoLine(lines, index)
      if (nextLine?.startsWith('(')) continue
      return true
    }
  }
  return true
}

function findNextNonEmptyGoLine(
  lines: string[],
  currentIndex: number,
): string | undefined {
  for (let index = currentIndex + 1; index < lines.length; index++) {
    const line = stripGoLineComment(lines[index]).trim()
    if (line) return line
  }
  return undefined
}

function stripCommentOutsideStrings(line: string, marker: '#' | '//'): string {
  let quote: string | undefined
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    const nextTwo = line.slice(index, index + 2)

    if (quote) {
      if (char === quote && line[index - 1] !== '\\') quote = undefined
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (marker === '#' && char === '#') return line.slice(0, index)
    if (marker === '//' && nextTwo === '//') return line.slice(0, index)
  }
  return line
}
