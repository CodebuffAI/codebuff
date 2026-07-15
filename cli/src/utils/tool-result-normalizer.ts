import type { ToolContentBlock } from '../types/chat'

export type ToolResultRecord = Record<string, unknown>

export const TERMINAL_TOOL_LIFECYCLES = new Set([
  'succeeded',
  'failed',
  'cancelled',
] as const)

export function getToolOutputValues(outputRaw: unknown): unknown[] {
  const parts = Array.isArray(outputRaw) ? outputRaw : [outputRaw]
  return parts
    .filter((part) => part !== undefined)
    .map((part) =>
      part && typeof part === 'object' && 'value' in part
        ? (part as { value: unknown }).value
        : part,
    )
}

export function getToolOutputRecords(outputRaw: unknown): ToolResultRecord[] {
  return getToolOutputValues(outputRaw).filter(
    (value): value is ToolResultRecord =>
      value !== null && typeof value === 'object' && !Array.isArray(value),
  )
}

export function findToolResultByKind(
  outputRaw: unknown,
  kind: string,
): ToolResultRecord | null {
  return (
    getToolOutputRecords(outputRaw).find((value) => value.kind === kind) ?? null
  )
}

function asMessage(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getStructuredErrorMessages(outputRaw: unknown): string[] {
  const messages: string[] = []
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 6 || value === null || value === undefined) return
    if (typeof value === 'string') return
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1))
      return
    }
    if (typeof value !== 'object') return

    const record = value as ToolResultRecord
    const error = record.error
    if (typeof error === 'string') messages.push(error.trim())
    else if (error && typeof error === 'object') {
      const message = asMessage((error as ToolResultRecord).message)
      if (message) messages.push(message)
    }
    const direct = asMessage(record.errorMessage)
    if (direct) messages.push(direct)
    if (record.kind === 'native_tool_result_error') {
      const message = asMessage(
        (record.error as ToolResultRecord | undefined)?.message,
      )
      if (message) messages.push(message)
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== 'error' && key !== 'errorMessage') visit(child, depth + 1)
    }
  }
  getToolOutputValues(outputRaw).forEach((value) => visit(value))
  return [...new Set(messages.filter(Boolean))]
}

export function hasMultipartError(outputRaw: unknown): boolean {
  return getStructuredErrorMessages(outputRaw).length > 0
}

export function getCanonicalMutationResult(
  outputRaw: unknown,
): ToolResultRecord | null {
  return findToolResultByKind(outputRaw, 'file_mutation_result')
}

export function getCanonicalMutationActions(
  outputRaw: unknown,
): ToolResultRecord[] {
  const result = getCanonicalMutationResult(outputRaw)
  return result && Array.isArray(result.actions)
    ? result.actions.filter(
        (action): action is ToolResultRecord =>
          action !== null &&
          typeof action === 'object' &&
          !Array.isArray(action),
      )
    : []
}

export function getCanonicalMutationPrimaryAction(
  outputRaw: unknown,
): ToolResultRecord | null {
  return getCanonicalMutationActions(outputRaw)[0] ?? null
}

export function isTerminalToolBlock(block: ToolContentBlock): boolean {
  return Boolean(
    block.lifecycle && TERMINAL_TOOL_LIFECYCLES.has(block.lifecycle as never),
  )
}

export function getConfirmedMutationActions(
  block: ToolContentBlock,
): ToolResultRecord[] {
  const result = getCanonicalMutationResult(block.outputRaw)
  if (!result || !Array.isArray(result.actions)) return []
  return result.actions.filter(
    (action): action is ToolResultRecord =>
      Boolean(action) &&
      typeof action === 'object' &&
      (action as ToolResultRecord).outcome === 'applied',
  )
}
