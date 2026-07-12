/**
 * Idiom-read traceability signals.
 *
 * For non-TypeScript edits, this pure trace analysis verifies that the edit is
 * covered by Openbuff's bundled language capability registry. Guidance is now
 * injected directly into prompts; user repositories no longer need to contain
 * or read `agents/idioms/<lang>.md` files.
 */

import { detectLanguageIdForPath } from '@codebuff/common/util/language-profiles'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { SupportedLanguageId } from '@codebuff/common/util/language-capabilities'

export type IdiomTraceLanguageId = Exclude<SupportedLanguageId, 'typescript'>

export type IdiomTraceVerdict = 'pass' | 'fail' | 'skip'

export interface IdiomTraceLanguageSignal {
  languageId: IdiomTraceLanguageId
  idiomPath: string
  editedPaths: string[]
  firstEditIndex: number
  priorReadIndex?: number
  satisfied: boolean
}

export interface IdiomTraceabilitySignals {
  nonTypeScriptEditCount: number
  languageSignals: IdiomTraceLanguageSignal[]
  hasRequiredReads: boolean
  /** Prompt delivery is not present in PrintModeEvent traces. */
  deliveryObservable: boolean
  isEmpty: boolean
}

export interface IdiomTraceabilityEvaluation {
  verdict: IdiomTraceVerdict
  signals: IdiomTraceabilitySignals
  reasons: string[]
}

const EDIT_TOOL_NAMES = new Set([
  'apply_patch',
  'apply_smart_patch',
  'str_replace',
  'write_file',
  'replace_range',
  'rewrite_symbol',
  'edit_transaction',
])

export function idiomPathForLanguage(languageId: IdiomTraceLanguageId): string {
  return `bundled:language-capabilities/${languageId}`
}

export function normalizeTracePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

export function languageForEditedPath(
  path: string,
): IdiomTraceLanguageId | 'typescript' | undefined {
  return detectLanguageIdForPath(normalizeTracePath(path))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function extractEditPaths(
  event: Extract<PrintModeEvent, { type: 'tool_call' }>,
): string[] {
  if (!EDIT_TOOL_NAMES.has(event.toolName)) return []

  const input = event.input
  if (!isRecord(input)) return []

  if (event.toolName === 'edit_transaction') {
    const edits = input.edits
    if (!Array.isArray(edits)) return []
    return edits
      .filter(isRecord)
      .map((edit) => stringField(edit, 'path'))
      .filter((path): path is string => path !== undefined)
  }

  if (event.toolName === 'apply_patch') {
    const patch = stringField(input, 'patch') ?? stringField(input, 'input')
    if (!patch) return []
    return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm)]
      .map((match) => match[1]?.trim())
      .filter((path): path is string => Boolean(path))
  }

  const path = stringField(input, 'path')
  return path ? [path] : []
}

export function computeIdiomTraceabilitySignals(
  events: readonly PrintModeEvent[],
): IdiomTraceabilitySignals {
  const signalsByLanguage = new Map<
    IdiomTraceLanguageId,
    IdiomTraceLanguageSignal
  >()
  let nonTypeScriptEditCount = 0

  events.forEach((event, index) => {
    if (event.type !== 'tool_call') return

    for (const rawPath of extractEditPaths(event)) {
      const normalizedPath = normalizeTracePath(rawPath)
      const languageId = languageForEditedPath(normalizedPath)
      if (!languageId || languageId === 'typescript') continue

      nonTypeScriptEditCount++
      const idiomPath = idiomPathForLanguage(languageId)
      const existing = signalsByLanguage.get(languageId)
      if (existing) {
        if (!existing.editedPaths.includes(normalizedPath)) {
          existing.editedPaths.push(normalizedPath)
        }
        continue
      }

      signalsByLanguage.set(languageId, {
        languageId,
        idiomPath,
        editedPaths: [normalizedPath],
        firstEditIndex: index,
        satisfied: true,
      })
    }
  })

  const languageSignals = [...signalsByLanguage.values()].sort(
    (a, b) => a.firstEditIndex - b.firstEditIndex,
  )
  const isEmpty = languageSignals.length === 0
  const hasRequiredReads = !isEmpty && languageSignals.every((s) => s.satisfied)

  return {
    nonTypeScriptEditCount,
    languageSignals,
    hasRequiredReads,
    deliveryObservable: false,
    isEmpty,
  }
}

export function evaluateIdiomTraceability(
  signals: IdiomTraceabilitySignals,
): IdiomTraceabilityEvaluation {
  if (signals.isEmpty) {
    return {
      verdict: 'skip',
      signals,
      reasons: ['No non-TypeScript supported-language edits were detected.'],
    }
  }

  if (!signals.deliveryObservable) {
    return {
      verdict: 'skip',
      signals,
      reasons: [
        'Bundled language guidance is validated by prompt-construction tests; PrintModeEvent traces do not expose system-prompt delivery.',
      ],
    }
  }

  const missing = signals.languageSignals.filter((signal) => !signal.satisfied)
  if (missing.length === 0) {
    return {
      verdict: 'pass',
      signals,
      reasons: [
        `All ${signals.languageSignals.length} non-TypeScript language edit(s) were covered by bundled capability guidance.`,
      ],
    }
  }

  return {
    verdict: 'fail',
    signals,
    reasons: missing.map(
      (signal) =>
        `${signal.languageId} edit(s) to ${signal.editedPaths.join(', ')} occurred before reading ${signal.idiomPath}.`,
    ),
  }
}
