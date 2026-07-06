/**
 * Idiom-read traceability signals.
 *
 * For non-TypeScript edits, this pure trace analysis verifies that the agent
 * read the matching `agents/idioms/<lang>.md` file before the first edit to a
 * source file in that language. It is an eval/reporting gate, not runtime
 * enforcement.
 */

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

export type IdiomTraceLanguageId =
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'

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
  isEmpty: boolean
}

export interface IdiomTraceabilityEvaluation {
  verdict: IdiomTraceVerdict
  signals: IdiomTraceabilitySignals
  reasons: string[]
}

const EDIT_TOOL_NAMES = new Set([
  'str_replace',
  'write_file',
  'rewrite_symbol',
  'edit_transaction',
])

const TYPESCRIPT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
])

const EXTENSION_LANGUAGE_MAP: Record<string, IdiomTraceLanguageId> = {
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.c': 'cpp',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.h': 'cpp',
  '.hh': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
}

export function idiomPathForLanguage(
  languageId: IdiomTraceLanguageId,
): string {
  return `agents/idioms/${languageId}.md`
}

export function normalizeTracePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

function extensionForPath(path: string): string | undefined {
  const normalized = normalizeTracePath(path).toLowerCase()
  const lastSegment = normalized.split('/').pop() ?? normalized
  const dotIndex = lastSegment.lastIndexOf('.')
  if (dotIndex <= 0) return undefined
  return lastSegment.slice(dotIndex)
}

export function languageForEditedPath(
  path: string,
): IdiomTraceLanguageId | 'typescript' | undefined {
  const extension = extensionForPath(path)
  if (!extension) return undefined
  if (TYPESCRIPT_EXTENSIONS.has(extension)) return 'typescript'
  return EXTENSION_LANGUAGE_MAP[extension]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function extractEditPaths(event: Extract<PrintModeEvent, { type: 'tool_call' }>): string[] {
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

  const path = stringField(input, 'path')
  return path ? [path] : []
}

function extractReadFilesPaths(
  event: Extract<PrintModeEvent, { type: 'tool_call' }>,
): string[] {
  if (event.toolName !== 'read_files') return []
  const input = event.input
  if (!isRecord(input)) return []

  const paths = new Set<string>()
  const rawPaths = input.paths
  if (Array.isArray(rawPaths)) {
    for (const path of rawPaths) {
      if (typeof path === 'string') paths.add(normalizeTracePath(path))
    }
  }

  const ranges = input.ranges
  if (Array.isArray(ranges)) {
    for (const range of ranges) {
      if (!isRecord(range)) continue
      const path = stringField(range, 'path')
      if (path) paths.add(normalizeTracePath(path))
    }
  }

  const symbols = input.symbols
  if (Array.isArray(symbols)) {
    for (const symbol of symbols) {
      if (!isRecord(symbol)) continue
      const path = stringField(symbol, 'path')
      if (path) paths.add(normalizeTracePath(path))
    }
  }

  return [...paths]
}

export function computeIdiomTraceabilitySignals(
  events: readonly PrintModeEvent[],
): IdiomTraceabilitySignals {
  const readIndicesByPath = new Map<string, number[]>()
  const signalsByLanguage = new Map<IdiomTraceLanguageId, IdiomTraceLanguageSignal>()
  let nonTypeScriptEditCount = 0

  events.forEach((event, index) => {
    if (event.type !== 'tool_call') return

    for (const path of extractReadFilesPaths(event)) {
      const existing = readIndicesByPath.get(path) ?? []
      existing.push(index)
      readIndicesByPath.set(path, existing)
    }

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

      const priorReadIndex = (readIndicesByPath.get(idiomPath) ?? [])
        .filter((readIndex) => readIndex < index)
        .at(-1)

      signalsByLanguage.set(languageId, {
        languageId,
        idiomPath,
        editedPaths: [normalizedPath],
        firstEditIndex: index,
        priorReadIndex,
        satisfied: priorReadIndex !== undefined,
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

  const missing = signals.languageSignals.filter((signal) => !signal.satisfied)
  if (missing.length === 0) {
    return {
      verdict: 'pass',
      signals,
      reasons: [
        `All ${signals.languageSignals.length} non-TypeScript language(s) read matching idiom guidance before first edit.`,
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
