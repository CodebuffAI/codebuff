import * as fs from 'fs'

import { jsonToolResult } from '@codebuff/common/util/messages'

import {
  preflightValidateSyntax,
  formatPreflightErrorMessage,
  countDelimitersOutsideStringsAndComments,
  isJavaScriptLikePath,
} from '../../../util/preflight-syntax-validation'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { FileProcessingState } from './write-file'

type ToolName = 'apply_smart_patch'

interface Hunk {
  oldStart: number
  oldLength: number
  newStart: number
  newLength: number
  lines: string[]
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
  if (autoHeal) {
    const healResult = autoHealSyntax(updatedContent, path)
    if (healResult.healed) {
      updatedContent = healResult.content
      syntaxAutoHealed = true
    }
  }

  // --- VIRTUAL COMPILE TRANSACTIONS: Preflight Syntax Check ---
  if (preflightCompile) {
    const syntaxValidation = preflightValidateSyntax(path, updatedContent)
    if (!syntaxValidation.valid) {
      return {
        output: jsonToolResult({
          file: path,
          applied: false,
          message: formatPreflightErrorMessage(
            'apply_smart_patch',
            path,
            syntaxValidation.message,
          ),
        }),
      }
    }
  }

  try {
    fs.writeFileSync(path, updatedContent, 'utf8')
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
 * Basic syntax self-healing: checks bracket balance and trailing commas.
 * Only applies to JavaScript-like files (.ts/.tsx/.js/.jsx).
 */
function autoHealSyntax(
  content: string,
  path: string,
): { healed: boolean; content: string } {
  // Auto-heal only applies to JavaScript-like files. Other file types
  // (Python, Go, etc.) have different syntax rules and are skipped.
  if (!isJavaScriptLikePath(path)) {
    return { healed: false, content }
  }

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
