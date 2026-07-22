import type { ToolName } from '@codebuff/common/tools/constants'

export const FILE_MUTATION_TOOL_TIMEOUT_MS = 120_000

const FILE_MUTATION_TOOLS = new Set<ToolName>([
  'apply_patch',
  'create_plan',
  'edit_transaction',
  'replace_range',
  'rewrite_symbol',
  'str_replace',
  'update_plan_status',
  'write_file',
  'write_audit_findings',
])

export function getDefaultToolExecutionTimeoutMs(
  toolName: string,
): number | undefined {
  return FILE_MUTATION_TOOLS.has(toolName as ToolName)
    ? FILE_MUTATION_TOOL_TIMEOUT_MS
    : undefined
}

export function createToolExecutionDeadline(params: {
  parentSignal: AbortSignal
  timeoutMs: number | undefined
  toolName: string
}): { signal: AbortSignal; dispose: () => void } {
  const { parentSignal, timeoutMs, toolName } = params
  if (timeoutMs === undefined || timeoutMs <= 0) {
    return { signal: parentSignal, dispose: () => {} }
  }

  const timeoutController = new AbortController()
  const timeout = setTimeout(() => {
    const error = new Error(
      `${toolName} timed out after ${Math.ceil(timeoutMs / 1000)} seconds. The operation was cancelled and no successful result is confirmed.`,
    )
    error.name = 'ToolExecutionTimeoutError'
    timeoutController.abort(error)
  }, timeoutMs)
  timeout.unref?.()

  return {
    signal: AbortSignal.any([parentSignal, timeoutController.signal]),
    dispose: () => clearTimeout(timeout),
  }
}
