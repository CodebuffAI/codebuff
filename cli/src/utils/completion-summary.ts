/**
 * Completion summary utility.
 * Walks accumulated agent/tool blocks to produce a concise summary block.
 */

import {
  extractDiff,
  extractFilePath,
  getFileStatsFromBlocks,
  isEditToolBlock,
} from './implementor-helpers'

import type { ContentBlock } from '../types/chat'

export type CompletionSummary = {
  filesEdited: number
  filesFailed: number
  reviewVerdict: string | null
  testPassed: number
  testFailed: number
  errors: number
}

const REVIEW_VERDICT_PATTERNS = [
  'BLOCKING',
  'NON_BLOCKING',
  'LOOKS_GOOD',
  'NEEDS_WORK',
  'APPROVED',
] as const

/**
 * Walk agent/tool blocks to tally completion stats.
 */
export function computeCompletionSummary(
  blocks: ContentBlock[],
): CompletionSummary | null {
  if (!blocks || blocks.length === 0) return null

  const summary: CompletionSummary = {
    filesEdited: 0,
    filesFailed: 0,
    reviewVerdict: null,
    testPassed: 0,
    testFailed: 0,
    errors: 0,
  }

  const editedFiles = new Set<string>()

  function walk(children: ContentBlock[]) {
    for (const block of children) {
      if (block.type === 'tool') {
        if (isEditToolBlock(block)) {
          const file = extractFilePath(block)
          const diff = extractDiff(block)
          const isFailed = !diff || diff.trim() === ''

          if (file && !editedFiles.has(file)) {
            editedFiles.add(file)
            if (isFailed) {
              summary.filesFailed++
            } else {
              summary.filesEdited++
            }
          }
        }

        // Detect review verdict from set_output tool results
        if (block.toolName === 'set_output') {
          const output = getToolOutputString(block)
          if (output && summary.reviewVerdict === null) {
            for (const pattern of REVIEW_VERDICT_PATTERNS) {
              if (output.includes(pattern)) {
                summary.reviewVerdict = pattern
                break
              }
            }
          }
        }

        // Detect test results from basher output
        if (block.toolName === 'run_terminal_command') {
          const output = getToolOutputString(block)
          if (output) {
            const passMatch = output.match(/(\d+)\s+pass(?:ed|ing)/i)
            const failMatch = output.match(/(\d+)\s+fail(?:ed|ing)/i)
            if (passMatch) {
              summary.testPassed += parseInt(passMatch[1], 10)
            }
            if (failMatch) {
              summary.testFailed += parseInt(failMatch[1], 10)
            }
          }
        }

        // Detect errors from tool output
        if (block.outputRaw && isErrorOutput(block)) {
          summary.errors++
        }
      }

      if (block.type === 'agent') {
        if (block.status === 'failed') {
          summary.errors++
        }
        // Check for code-reviewer agent verdict
        if (
          block.agentType?.includes('code-reviewer') &&
          block.status === 'complete'
        ) {
          const content = block.content || ''
          for (const pattern of REVIEW_VERDICT_PATTERNS) {
            if (
              content.includes(pattern) &&
              summary.reviewVerdict === null
            ) {
              summary.reviewVerdict = pattern
              break
            }
          }
        }
        if (block.blocks) {
          walk(block.blocks)
        }
      }
    }
  }

  walk(blocks)

  // Also incorporate pre-computed file stats
  const stats = getFileStatsFromBlocks(blocks)
  if (stats.length > 0 && summary.filesEdited === 0 && summary.filesFailed === 0) {
    for (const s of stats) {
      summary.filesEdited++
    }
  }

  if (
    summary.filesEdited === 0 &&
    summary.filesFailed === 0 &&
    summary.reviewVerdict === null &&
    summary.testPassed === 0 &&
    summary.testFailed === 0 &&
    summary.errors === 0
  ) {
    return null
  }

  return summary
}

function getToolOutputString(block: { output?: string; outputRaw?: unknown }): string {
  if (typeof block.output === 'string' && block.output.trim()) {
    return block.output
  }
  if (Array.isArray(block.outputRaw) && block.outputRaw.length > 0) {
    const first = block.outputRaw[0]
    if (first && typeof first === 'object' && 'value' in first) {
      return typeof first.value === 'string'
        ? first.value
        : JSON.stringify(first.value)
    }
  }
  if (block.outputRaw && typeof block.outputRaw === 'object') {
    return JSON.stringify(block.outputRaw)
  }
  return ''
}

function isErrorOutput(block: { outputRaw?: unknown }): boolean {
  if (Array.isArray(block.outputRaw) && block.outputRaw.length > 0) {
    const first = block.outputRaw[0]
    if (first && typeof first === 'object' && 'value' in first) {
      const v = first.value as Record<string, unknown>
      return Boolean(v.error || v.errorMessage)
    }
  }
  return false
}

/**
 * Format a completion summary into a human-readable string.
 */
export function formatCompletionSummary(summary: CompletionSummary): string {
  const parts: string[] = []

  if (summary.filesEdited > 0 || summary.filesFailed > 0) {
    let editPart = ''
    if (summary.filesEdited > 0) {
      editPart += `${summary.filesEdited} file${summary.filesEdited !== 1 ? 's' : ''} edited`
    }
    if (summary.filesFailed > 0) {
      if (editPart) editPart += ', '
      editPart += `${summary.filesFailed} failed`
    }
    if (summary.filesFailed > 0) {
      parts.push(`⚠️ ${editPart}`)
    } else {
      parts.push(`✅ ${editPart}`)
    }
  }

  if (summary.reviewVerdict) {
    const verd = summary.reviewVerdict
    const icon =
      verd === 'BLOCKING' || verd === 'NEEDS_WORK'
        ? '🔴'
        : verd === 'NON_BLOCKING'
          ? '🟡'
          : '🟢'
    parts.push(`Reviewed: ${icon} ${verd}`)
  }

  if (summary.testPassed > 0 || summary.testFailed > 0) {
    let testPart = 'Tests: '
    if (summary.testPassed > 0) {
      testPart += `${summary.testPassed} passed`
    }
    if (summary.testFailed > 0) {
      if (summary.testPassed > 0) testPart += ', '
      testPart += `${summary.testFailed} failed`
    }
    parts.push(summary.testFailed > 0 ? `❌ ${testPart}` : `✅ ${testPart}`)
  }

  if (summary.errors > 0) {
    parts.push(`❌ ${summary.errors} error${summary.errors !== 1 ? 's' : ''}`)
  }

  return parts.join(' | ')
}
