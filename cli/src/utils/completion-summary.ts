/**
 * Completion summary utility.
 * Walks accumulated agent/tool blocks to produce a concise summary block.
 */

import {
  extractDiff,
  extractFilePath,
  isEditToolBlock,
} from './implementor-helpers'
import {
  getCanonicalMutationResult,
  getConfirmedMutationActions,
} from './tool-result-normalizer'

import type { ContentBlock } from '../types/chat'

export type CompletionSummary = {
  filesEdited: number
  filesFailed: number
  filesUnconfirmed: number
  filesRolledBack: number
  rollbackIncomplete: number
  reviewVerdict: string | null
  testPassed: number
  testFailed: number
  hooksPassed: number
  hooksFailed: number
  hooksSkipped: number
  auxiliaryCompleted: number
  auxiliaryFailed: number
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
    filesUnconfirmed: 0,
    filesRolledBack: 0,
    rollbackIncomplete: 0,
    reviewVerdict: null,
    testPassed: 0,
    testFailed: 0,
    hooksPassed: 0,
    hooksFailed: 0,
    hooksSkipped: 0,
    auxiliaryCompleted: 0,
    auxiliaryFailed: 0,
    errors: 0,
  }

  const fileOutcomes = new Map<
    string,
    'edited' | 'failed' | 'unconfirmed' | 'rolled_back' | 'rollback_incomplete'
  >()

  function walk(children: ContentBlock[], insideAgent = false): number {
    let countedErrors = 0
    for (const block of children) {
      if (block.type === 'tool') {
        const isEdit = isEditToolBlock(block)
        if (isEdit) {
          const canonical = getCanonicalMutationResult(block.outputRaw)
          if (canonical) {
            const confirmed = new Set(
              getConfirmedMutationActions(block).map((action) =>
                String(action.destinationPath ?? action.path),
              ),
            )
            for (const raw of canonical.actions as Array<
              Record<string, unknown>
            >) {
              const path = String(raw.destinationPath ?? raw.path)
              const outcome = String(raw.outcome)
              fileOutcomes.set(
                path,
                confirmed.has(path)
                  ? 'edited'
                  : outcome === 'unconfirmed'
                    ? 'unconfirmed'
                    : outcome === 'rolled_back'
                      ? 'rolled_back'
                      : outcome === 'rollback_incomplete'
                        ? 'rollback_incomplete'
                        : 'failed',
              )
            }
          } else if (block.lifecycle !== 'cancelled') {
            const file = extractFilePath(block)
            const diff = extractDiff(block)
            if (file) fileOutcomes.set(file, diff?.trim() ? 'edited' : 'failed')
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

        if (block.toolName === 'run_file_change_hooks') {
          for (const result of getHookResults(block.outputRaw)) {
            const status = String(result.validationStatus ?? '')
            const failed =
              typeof result.errorMessage === 'string' ||
              (typeof result.exitCode === 'number' && result.exitCode !== 0)
            if (failed) summary.hooksFailed++
            else if (
              status === 'hooks_skipped' ||
              status === 'no_hooks_configured'
            ) {
              summary.hooksSkipped++
            } else summary.hooksPassed++
          }
        }

        // Detect errors from tool output
        // Edit failures already have a dedicated per-file outcome above.
        // Counting them again as generic errors made recoverable edit retries
        // dominate the completion summary.
        if (
          !insideAgent &&
          !isEdit &&
          block.outputRaw &&
          isErrorOutput(block)
        ) {
          summary.errors++
          countedErrors++
        }
      }

      if (block.type === 'agent') {
        const isAuxiliary = [
          'security-reviewer',
          'test-writer',
          'doc-writer',
          'git-committer',
          'librarian',
          'synthesizer',
          'browser-use',
          'tmux-cli',
          'debugger',
        ].some((type) => block.agentType?.includes(type))
        if (isAuxiliary) {
          if (block.status === 'failed') summary.auxiliaryFailed++
          else if (block.status === 'complete') summary.auxiliaryCompleted++
        }
        // Check for code-reviewer agent verdict
        if (
          block.agentType?.includes('code-reviewer') &&
          block.status === 'complete'
        ) {
          const content = block.content || ''
          for (const pattern of REVIEW_VERDICT_PATTERNS) {
            if (content.includes(pattern) && summary.reviewVerdict === null) {
              summary.reviewVerdict = pattern
              break
            }
          }
        }
        const descendantErrors = block.blocks
          ? walk(block.blocks, true)
          : 0
        // Auxiliary failures already have their own explicit count. For other
        // agents, count the failed wrapper only when no nested tool/agent error
        // already explains it.
        if (
          block.status === 'failed' &&
          !isAuxiliary &&
          descendantErrors === 0
        ) {
          summary.errors++
          countedErrors++
        }
        countedErrors += descendantErrors
      }
    }
    return countedErrors
  }

  walk(blocks)

  for (const outcome of fileOutcomes.values()) {
    if (outcome === 'edited') summary.filesEdited++
    else if (outcome === 'unconfirmed') summary.filesUnconfirmed++
    else if (outcome === 'rolled_back') summary.filesRolledBack++
    else if (outcome === 'rollback_incomplete') summary.rollbackIncomplete++
    else summary.filesFailed++
  }

  if (
    summary.filesEdited === 0 &&
    summary.filesFailed === 0 &&
    summary.filesUnconfirmed === 0 &&
    summary.filesRolledBack === 0 &&
    summary.rollbackIncomplete === 0 &&
    summary.reviewVerdict === null &&
    summary.testPassed === 0 &&
    summary.testFailed === 0 &&
    summary.hooksPassed === 0 &&
    summary.hooksFailed === 0 &&
    summary.hooksSkipped === 0 &&
    summary.auxiliaryCompleted === 0 &&
    summary.auxiliaryFailed === 0 &&
    summary.errors === 0
  ) {
    return null
  }

  return summary
}

function getHookResults(outputRaw: unknown): Array<Record<string, unknown>> {
  const first = Array.isArray(outputRaw) ? outputRaw[0] : outputRaw
  const value =
    first && typeof first === 'object' && 'value' in first
      ? (first as { value: unknown }).value
      : first
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          entry !== null && typeof entry === 'object' && !Array.isArray(entry),
      )
    : []
}

function getToolOutputString(block: {
  output?: string
  outputRaw?: unknown
}): string {
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
      return Boolean(
        v.error ||
        v.errorMessage ||
        (Array.isArray(v.errors) && v.errors.length > 0),
      )
    }
  }
  return false
}

/**
 * Format a completion summary into a human-readable string.
 */
export function formatCompletionSummary(summary: CompletionSummary): string {
  const parts: string[] = []

  if (summary.auxiliaryCompleted > 0 || summary.auxiliaryFailed > 0) {
    parts.push(
      `${summary.auxiliaryFailed > 0 ? '⚠️' : '✅'} ${summary.auxiliaryCompleted} auxiliary agent${summary.auxiliaryCompleted === 1 ? '' : 's'} completed${summary.auxiliaryFailed > 0 ? `, ${summary.auxiliaryFailed} failed` : ''}`,
    )
  }

  if (
    summary.filesEdited > 0 ||
    summary.filesFailed > 0 ||
    summary.filesUnconfirmed > 0 ||
    summary.filesRolledBack > 0 ||
    summary.rollbackIncomplete > 0
  ) {
    let editPart = ''
    if (summary.filesEdited > 0) {
      editPart += `${summary.filesEdited} file${summary.filesEdited !== 1 ? 's' : ''} edited`
    }
    if (summary.filesFailed > 0) {
      if (editPart) editPart += ', '
      editPart += `${summary.filesFailed} failed`
    }
    if (summary.filesUnconfirmed > 0) {
      if (editPart) editPart += ', '
      editPart += `${summary.filesUnconfirmed} unconfirmed`
    }
    if (summary.filesRolledBack > 0) {
      if (editPart) editPart += ', '
      editPart += `${summary.filesRolledBack} rolled back`
    }
    if (summary.rollbackIncomplete > 0) {
      if (editPart) editPart += ', '
      editPart += `${summary.rollbackIncomplete} rollback incomplete`
    }
    if (
      summary.filesFailed > 0 ||
      summary.filesUnconfirmed > 0 ||
      summary.rollbackIncomplete > 0
    ) {
      parts.push(`⚠️ ${editPart}`)
    } else {
      parts.push(`✅ ${editPart}`)
    }
  }

  if (summary.hooksPassed || summary.hooksFailed || summary.hooksSkipped) {
    const hookParts = [
      summary.hooksPassed ? `${summary.hooksPassed} passed` : '',
      summary.hooksFailed ? `${summary.hooksFailed} failed` : '',
      summary.hooksSkipped ? `${summary.hooksSkipped} skipped` : '',
    ].filter(Boolean)
    parts.push(
      `${summary.hooksFailed ? '❌' : '✅'} Hooks: ${hookParts.join(', ')}`,
    )
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
