import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { FileProcessingState } from './write-file'

declare const Bun: any

type ToolName = 'apply_smart_patch'

interface Hunk {
  oldStart: number
  oldLength: number
  newStart: number
  newLength: number
  lines: string[]
}

type SyntaxValidationResult = { valid: boolean; message: string }

type PythonLineState = {
  delimiterDepthBeforeLine: number
  inTripleQuoteBeforeLine: boolean
}

export const handleApplySmartPatch = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: any
    requestOptionalFile: RequestOptionalFileFn
    fileProcessingState: FileProcessingState
  },
): Promise<{ output: any }> => {
  const {
    previousToolCallFinished,
    toolCall,
    requestOptionalFile,
    fileProcessingState,
  } = params
  const {
    path,
    patch,
    fuzzFactor = 3,
    autoHeal = true,
    preflightCompile = true,
    allowPositionalFallback = false,
  } = toolCall.input

  await previousToolCallFinished

  const originalContent = await requestOptionalFile({ ...params, filePath: path })
  if (originalContent === null) {
    return {
      output: jsonToolResult({
        file: path,
        applied: false,
        message: 'Error: File does not exist.',
      }),
    }
  }

  const fileLines = originalContent.split(/\r?\n/)
  const lineEnding = originalContent.includes('\r\n') ? '\r\n' : '\n'

  // --- LAYER A: Unified Diff Patch Parsing ---
  const hunks = parseUnifiedDiffHunks(patch, fileLines.length)

  let finalLines = [...fileLines]
  let totalOffset = 0
  let matchedLineNum = hunks[0]?.oldStart || 1
  let syntaxAutoHealed = false

  // Apply each hunk with Layer B (Fuzzy Line Alignment)
  for (const hunk of hunks) {
    const { expectedOldLines, newReplacementLines } = getHunkLineGroups(hunk)

    // --- LAYER B: Fuzzy Line Alignment & Offset Matching ---
    const targetStart = hunk.oldStart + totalOffset
    const bestLineIndex = findBestHunkLineIndex({
      finalLines,
      expectedOldLines,
      targetStart,
      fuzzFactor,
    })

    if (bestLineIndex !== -1) {
      matchedLineNum = bestLineIndex + 1
      const deletedCount = expectedOldLines.length
      const actualFileLines = finalLines.slice(
        bestLineIndex,
        bestLineIndex + deletedCount,
      )
      const mergeResult = threeWayMerge(
        expectedOldLines,
        newReplacementLines,
        actualFileLines,
      )
      if (!mergeResult.success) {
        return {
          output: jsonToolResult({
            file: path,
            applied: false,
            message: `Smart patch conflict: ${mergeResult.message}. No changes were written.`,
          }),
        }
      }
      const mergedLines = mergeResult.lines

      finalLines.splice(bestLineIndex, deletedCount, ...mergedLines)
      totalOffset += mergedLines.length - deletedCount
    } else {
      if (!allowPositionalFallback) {
        return {
          output: jsonToolResult({
            file: path,
            applied: false,
            message:
              'Smart patch could not find a unique matching hunk; no changes were written. Retry with more context lines or use exact str_replace fallback.',
          }),
        }
      }
      const fallbackIdx = Math.max(
        0,
        Math.min(finalLines.length, targetStart - 1),
      )
      finalLines.splice(fallbackIdx, hunk.oldLength, ...newReplacementLines)
      totalOffset += newReplacementLines.length - hunk.oldLength
    }
  }

  let updatedContent = finalLines.join(lineEnding)

  // --- LAYER C: Syntax Self-Healing ---
  if (autoHeal && isJavaScriptLikePath(path)) {
    const healResult = autoHealSyntax(updatedContent)
    if (healResult.healed) {
      updatedContent = healResult.content
      syntaxAutoHealed = true
    }
  }

  // --- VIRTUAL COMPILE TRANSACTIONS: Preflight Syntax Check ---
  if (preflightCompile) {
    const syntaxValidation = validateSyntaxForPath(path, updatedContent)
    if (!syntaxValidation.valid) {
      return {
        output: jsonToolResult({
          file: path,
          applied: false,
          message: `Preflight Syntax Validation Failed (Layer C): ${syntaxValidation.message}. The edit was NOT written to disk. Please correct the syntax in your next attempt.`,
        }),
      }
    }
  }

  try {
    await Bun.write(path, updatedContent)
    delete fileProcessingState.promisesByPath[path]
  } catch (error: any) {
    return {
      output: jsonToolResult({
        file: path,
        applied: false,
        message: `Failed to write file to disk: ${error.message}`,
      }),
    }
  }

  return {
    output: jsonToolResult({
      file: path,
      applied: true,
      alignedLine: matchedLineNum,
      offsetAdjusted: totalOffset,
      syntaxAutoHealed,
      preflightPassed: preflightCompile,
      message: `Smart Patch Applied successfully! ${
        syntaxAutoHealed
          ? 'Syntactical issues were automatically auto-healed.'
          : ''
      }`,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function parseUnifiedDiffHunks(patch: string, fallbackOldLength: number): Hunk[] {
  const hunks: Hunk[] = []
  const patchLines = patch.split('\n')
  let currentHunk: Hunk | null = null

  for (const line of patchLines) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/)
      if (!match) continue

      if (currentHunk) {
        hunks.push(currentHunk)
      }
      currentHunk = {
        oldStart: parseInt(match[1], 10),
        oldLength: match[2] ? parseInt(match[2], 10) : 1,
        newStart: parseInt(match[3], 10),
        newLength: match[4] ? parseInt(match[4], 10) : 1,
        lines: [],
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line)
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk)
  }

  if (hunks.length === 0) {
    hunks.push({
      oldStart: 1,
      oldLength: fallbackOldLength,
      newStart: 1,
      newLength: patchLines.length,
      lines: patchLines,
    })
  }

  return hunks
}

function getHunkLineGroups(hunk: Hunk): {
  expectedOldLines: string[]
  newReplacementLines: string[]
} {
  const expectedOldLines: string[] = []
  const newReplacementLines: string[] = []

  for (const hunkLine of hunk.lines) {
    if (hunkLine.startsWith('-')) {
      expectedOldLines.push(hunkLine.slice(1))
    } else if (hunkLine.startsWith('+')) {
      newReplacementLines.push(hunkLine.slice(1))
    } else if (hunkLine.startsWith(' ')) {
      const actualLine = hunkLine.slice(1)
      expectedOldLines.push(actualLine)
      newReplacementLines.push(actualLine)
    } else {
      expectedOldLines.push(hunkLine)
      newReplacementLines.push(hunkLine)
    }
  }

  return { expectedOldLines, newReplacementLines }
}

function findBestHunkLineIndex(params: {
  finalLines: string[]
  expectedOldLines: string[]
  targetStart: number
  fuzzFactor: number
}): number {
  const { finalLines, expectedOldLines, targetStart, fuzzFactor } = params
  const maxSearchOffset = Math.max(20, fuzzFactor * 5)
  const minSearchIdx = Math.max(0, targetStart - 1 - maxSearchOffset)
  const maxSearchIdx = Math.min(
    finalLines.length - expectedOldLines.length,
    targetStart - 1 + maxSearchOffset,
  )

  const localMatch = findBestMatchInRange({
    finalLines,
    expectedOldLines,
    minSearchIdx,
    maxSearchIdx,
  })
  if (isAcceptableMatch(localMatch, expectedOldLines)) {
    return localMatch.bestLineIndex
  }

  const globalMatch = findBestMatchInRange({
    finalLines,
    expectedOldLines,
    minSearchIdx: 0,
    maxSearchIdx: Math.max(0, finalLines.length - expectedOldLines.length),
  })
  if (isAcceptableMatch(globalMatch, expectedOldLines)) {
    return globalMatch.bestLineIndex
  }

  return -1
}

function findBestMatchInRange(params: {
  finalLines: string[]
  expectedOldLines: string[]
  minSearchIdx: number
  maxSearchIdx: number
}): { bestLineIndex: number; bestScore: number; bestScoreCount: number } {
  const { finalLines, expectedOldLines, minSearchIdx, maxSearchIdx } = params
  let bestLineIndex = -1
  let bestScore = 0
  let bestScoreCount = 0

  for (let idx = minSearchIdx; idx <= maxSearchIdx; idx++) {
    let matchedCount = 0
    for (let j = 0; j < expectedOldLines.length; j++) {
      const fileLine = finalLines[idx + j]?.trim()
      const patchLine = expectedOldLines[j]?.trim()
      if (fileLine === patchLine) {
        matchedCount++
      }
    }

    const score =
      expectedOldLines.length === 0 ? 1 : matchedCount / expectedOldLines.length
    if (score > bestScore) {
      bestScore = score
      bestLineIndex = idx
      bestScoreCount = 1
    } else if (score === bestScore && score > 0) {
      bestScoreCount++
    }
  }

  return { bestLineIndex, bestScore, bestScoreCount }
}

function isAcceptableMatch(
  match: { bestLineIndex: number; bestScore: number; bestScoreCount: number },
  expectedOldLines: string[],
): boolean {
  if (match.bestLineIndex === -1) return false
  if (expectedOldLines.length === 0) return true
  return match.bestScore >= 0.7 && match.bestScoreCount === 1
}

/**
 * Basic syntax self-healing: checks bracket balance and trailing commas
 */
function autoHealSyntax(content: string): { healed: boolean; content: string } {
  let healed = false
  let currentContent = content

  const { openBraces, closeBraces } = countDelimitersOutsideStringsAndComments(
    currentContent,
    'javascript',
  )

  if (openBraces > closeBraces) {
    const missing = openBraces - closeBraces
    currentContent += '\n' + '}'.repeat(missing)
    healed = true
  }

  const normalized = currentContent.replace(/,(\s*,)+/g, ',')
  if (normalized !== currentContent) {
    currentContent = normalized
    healed = true
  }

  return {
    healed,
    content: currentContent,
  }
}

function validateSyntaxForPath(
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

function validateJavaScriptLikeSyntax(
  path: string,
  content: string,
): SyntaxValidationResult {
  try {
    const transpiler = new Bun.Transpiler({
      loader: path.endsWith('.tsx') || path.endsWith('.jsx') ? 'jsx' : 'ts',
    })
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
    if (leadingWhitespace.includes('\t')) {
      return {
        valid: false,
        message: `Python indentation uses tabs at line ${index + 1}; use spaces for predictable block validation.`,
      }
    }

    const indent = leadingWhitespace.length
    const previousIndent = indentStack[indentStack.length - 1]
    if (indent > previousIndent) {
      const previousCodeLine = findPreviousPythonCodeLine(lines, lineStates, index)
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
      const nextIndent = nextCodeLine.match(/^\s*/)?.[0].length ?? 0
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

function countDelimitersOutsideStringsAndComments(
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

function isJavaScriptLikePath(path: string): boolean {
  return /\.(?:ts|tsx|js|jsx)$/.test(path)
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

    if (index > startIndex && /^\s*(?:func|if|for|switch|select)\b/.test(line)) {
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

/**
 * Line-level three-way merge to reconcile patch changes with potentially shifted/modified lines on disk.
 */
function threeWayMerge(
  ancestor: string[],
  modifiedA: string[],
  modifiedB: string[],
): { success: true; lines: string[] } | { success: false; message: string } {
  const merged: string[] = []
  const maxLines = Math.max(ancestor.length, modifiedA.length, modifiedB.length)

  for (let i = 0; i < maxLines; i++) {
    const base = ancestor[i]
    const a = modifiedA[i]
    const b = modifiedB[i]

    if (base !== undefined) {
      if (a === base && b === base) {
        merged.push(base)
      } else if (a !== base && b === base) {
        if (a !== undefined) merged.push(a)
      } else if (b !== base && a === base) {
        if (b !== undefined) merged.push(b)
      } else if (a === b) {
        if (a !== undefined) merged.push(a)
      } else {
        return {
          success: false,
          message: `both patch and file changed line ${i + 1} differently`,
        }
      }
    } else {
      if (a !== undefined) merged.push(a)
      if (b !== undefined && b !== a) merged.push(b)
    }
  }
  return { success: true, lines: merged }
}
