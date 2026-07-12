import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

const READ_TOOLS = new Set([
  'read_files',
  'read_outline',
  'read_subtree',
  'read_slices',
])

const EDIT_TOOLS = new Set([
  'apply_patch',
  'edit_transaction',
  'replace_range',
  'rewrite_symbol',
  'str_replace',
  'write_file',
])

export interface RetrievalFlowMetrics {
  queryCallCount: number
  queryResultPaths: string[]
  successfulReadPaths: string[]
  relevantReadPaths: string[]
  irrelevantReadPaths: string[]
  queryHitAtK?: boolean
  queryResultToReadConversion?: number
  irrelevantReadRatio?: number
  toolCallsToFirstRelevantRead?: number
  relevantReadBeforeFirstEdit?: boolean
}

export function computeRetrievalFlowMetrics(params: {
  trace: readonly PrintModeEvent[]
  expectedPaths: readonly string[]
  topK?: number
}): RetrievalFlowMetrics {
  const { trace, topK = 10 } = params
  const expected = new Set(params.expectedPaths.map(normalizePath))
  const queryResultPaths: string[] = []
  const successfulReadPaths: string[] = []
  let queryCallCount = 0
  let toolCallCount = 0
  let firstRelevantReadToolCalls: number | undefined
  let firstRelevantReadEvent: number | undefined
  let firstEditEvent: number | undefined

  for (let eventIndex = 0; eventIndex < trace.length; eventIndex++) {
    const event = trace[eventIndex]
    if (event.type === 'tool_call') {
      toolCallCount += 1
      if (event.toolName === 'query_index') queryCallCount += 1
      if (EDIT_TOOLS.has(event.toolName) && firstEditEvent === undefined) {
        firstEditEvent = eventIndex
      }
      continue
    }
    if (event.type !== 'tool_result') continue

    if (event.toolName === 'query_index') {
      appendUnique(queryResultPaths, collectQueryResultPaths(event.output))
      continue
    }
    if (!READ_TOOLS.has(event.toolName)) continue

    const readPaths = collectSuccessfulPaths(event.output)
    appendUnique(successfulReadPaths, readPaths)
    if (
      firstRelevantReadEvent === undefined &&
      readPaths.some((path) => expected.has(path))
    ) {
      firstRelevantReadEvent = eventIndex
      firstRelevantReadToolCalls = toolCallCount
    }
  }

  const relevantReadPaths = successfulReadPaths.filter((path) =>
    expected.has(path),
  )
  const irrelevantReadPaths = successfulReadPaths.filter(
    (path) => !expected.has(path),
  )
  const queryReadCount = queryResultPaths.filter((path) =>
    successfulReadPaths.includes(path),
  ).length

  return {
    queryCallCount,
    queryResultPaths,
    successfulReadPaths,
    relevantReadPaths,
    irrelevantReadPaths,
    queryHitAtK:
      queryCallCount > 0 && expected.size > 0
        ? queryResultPaths.slice(0, topK).some((path) => expected.has(path))
        : undefined,
    queryResultToReadConversion:
      queryResultPaths.length > 0
        ? queryReadCount / queryResultPaths.length
        : undefined,
    irrelevantReadRatio:
      successfulReadPaths.length > 0
        ? irrelevantReadPaths.length / successfulReadPaths.length
        : undefined,
    toolCallsToFirstRelevantRead: firstRelevantReadToolCalls,
    relevantReadBeforeFirstEdit:
      firstEditEvent === undefined
        ? firstRelevantReadEvent !== undefined
        : firstRelevantReadEvent !== undefined &&
          firstRelevantReadEvent < firstEditEvent,
  }
}

function collectQueryResultPaths(output: unknown): string[] {
  const paths: string[] = []
  visit(output, (value) => {
    if (!isRecord(value) || !Array.isArray(value.results)) return
    for (const result of value.results) {
      if (isRecord(result) && typeof result.path === 'string') {
        paths.push(normalizePath(result.path))
      }
    }
  })
  return paths
}

function collectSuccessfulPaths(output: unknown): string[] {
  const paths: string[] = []
  visit(output, (value) => {
    if (!isRecord(value) || typeof value.path !== 'string') return
    const successful =
      value.status === 'ok' ||
      value.success === true ||
      typeof value.content === 'string' ||
      typeof value.outline === 'string'
    if (successful) paths.push(normalizePath(value.path))
  })
  return paths
}

function visit(value: unknown, fn: (value: unknown) => void): void {
  fn(value)
  if (Array.isArray(value)) {
    for (const item of value) visit(item, fn)
    return
  }
  if (!isRecord(value)) return
  for (const child of Object.values(value)) visit(child, fn)
}

function appendUnique(target: string[], values: readonly string[]): void {
  for (const value of values) {
    if (!target.includes(value)) target.push(value)
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
