import { jsonToolResult } from '@codebuff/common/util/messages'
import { getContentHash } from '@codebuff/common/util/content-hash'

import {
  preflightValidateSyntax,
  formatPreflightErrorMessage,
} from '../../../util/preflight-syntax-validation'
import { coordinateEditApplication } from './edit-application-coordinator'
import { normalizeToolPath } from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'apply_smart_patch'

interface Hunk {
  oldStart: number
  oldLength: number
  newStart: number
  newLength: number
  lines: string[]
}

export const handleApplySmartPatch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: any
  requestOptionalFile: RequestOptionalFileFn
  requestClientToolCall: (
    toolCall: ClientToolCall<'apply_smart_patch'>,
  ) => Promise<CodebuffToolOutput<'apply_smart_patch'>>
  fileProcessingState: FileProcessingState
}): Promise<{ output: any }> => {
  const {
    previousToolCallFinished,
    toolCall,
    requestOptionalFile,
    requestClientToolCall,
    fileProcessingState,
  } = params
  const {
    path: inputPath,
    patch,
    fuzzFactor = 3,
    preflightCompile = true,
    allowPositionalFallback = false,
  } = toolCall.input
  const path = normalizeToolPath(inputPath)
  if (!path) {
    return {
      output: jsonToolResult({
        file: inputPath,
        applied: false,
        validatorStatus: 'skipped',
        validatorIdentity: 'not-run:unsafe-path',
        message: `apply_smart_patch path traversal blocked: "${inputPath}" resolves outside the project root.`,
      }),
    }
  }

  await previousToolCallFinished

  const originalContent = await requestOptionalFile({
    ...params,
    filePath: path,
  })
  if (originalContent === null) {
    return {
      output: jsonToolResult({
        file: path,
        applied: false,
        validatorStatus: 'skipped',
        validatorIdentity: 'not-run:file-missing',
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
  const syntaxAutoHealed = false

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
            validatorStatus: 'skipped',
            validatorIdentity: 'not-run:patch-conflict',
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
            validatorStatus: 'skipped',
            validatorIdentity: 'not-run:hunk-alignment',
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

  const updatedContent = finalLines.join(lineEnding)
  // --- VIRTUAL COMPILE TRANSACTIONS: Preflight Syntax Check ---
  if (preflightCompile) {
    const syntaxValidation = preflightValidateSyntax(path, updatedContent)
    if (!syntaxValidation.valid) {
      return {
        output: jsonToolResult({
          file: path,
          applied: false,
          validatorStatus: 'failed',
          validatorIdentity: getValidatorIdentity(path),
          message: formatPreflightErrorMessage(
            'apply_smart_patch',
            path,
            syntaxValidation.message,
          ),
        }),
      }
    }
  }

  const application = await coordinateEditApplication<'write_file'>({
    toolName: 'write_file',
    fileProcessingState,
    paths: [path],
    wholeFileContentByPath: new Map([[path, updatedContent]]),
    apply: () =>
      (
        requestClientToolCall as unknown as (
          clientToolCall: ClientToolCall<'write_file'>,
        ) => Promise<CodebuffToolOutput<'write_file'>>
      )({
        toolCallId: toolCall.toolCallId,
        toolName: 'write_file',
        input: {
          type: 'file',
          path,
          content: updatedContent,
          expectedHash: getContentHash(originalContent),
        },
      }),
  })
  if (application.status !== 'applied') {
    return {
      output: jsonToolResult({
        file: path,
        applied: false,
        validatorStatus: preflightCompile ? 'passed' : 'skipped',
        validatorIdentity: preflightCompile
          ? getValidatorIdentity(path)
          : 'disabled-by-request',
        message:
          application.status === 'threw'
            ? `Failed to apply smart patch through the client filesystem authority: ${application.error instanceof Error ? application.error.message : String(application.error)}`
            : 'The client did not confirm that the smart patch content was applied. Re-read the file before retrying.',
      }),
    }
  }

  return { output: application.output as CodebuffToolOutput<ToolName> }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function getValidatorIdentity(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase()
  if (['ts', 'tsx', 'js', 'jsx'].includes(extension ?? '')) {
    return `bun-transpiler:${extension}`
  }
  if (extension === 'py') return 'python-structural-validator:v1'
  if (extension === 'go') return 'go-structural-validator:v1'
  return 'no-validator-for-file-type'
}

function parseUnifiedDiffHunks(
  patch: string,
  fallbackOldLength: number,
): Hunk[] {
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
  if (expectedOldLines.length === 0) {
    // Unified diff zero-old-count hunks identify the insertion boundary after
    // oldStart lines, unlike replacement hunks whose oldStart is one-based.
    return Math.max(0, Math.min(finalLines.length, targetStart))
  }
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
