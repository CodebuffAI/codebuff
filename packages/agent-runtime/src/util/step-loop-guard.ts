import { getContentHash } from '@codebuff/common/util/content-hash'

export const REPEATED_STEP_LOOP_LIMIT = 6

// Polling tools that watch a single background job by jobId. Repeated calls
// with the same jobId (regardless of wait_for, timeouts, cursor, or returned
// log/chunk content) are treated as one repeated signature so the guard can
// stop no-progress polling loops such as 3D/render exports that never reach
// artifact inspection. Keeps non-polling tools and read_logs calls without a
// jobId unchanged.
const POLLING_TOOL_NAMES: ReadonlySet<string> = new Set([
  'check_job',
  'check_background_agent',
  'read_logs',
])

// Stable marker substituted in place of poll result content so changing
// cursors/chunks/outputs do not perturb the signature.
const POLLING_RESULT_MARKER = '__POLLING_RESULT__'

type PollingInput = { jobId?: unknown }

function extractPollingJobId(
  toolName: string,
  input: unknown,
): string | undefined {
  if (!POLLING_TOOL_NAMES.has(toolName)) return undefined
  // read_logs may target a file path instead of a job: only normalize when a
  // non-empty string jobId is present so path-based reads keep raw input.
  if (typeof input !== 'object' || input === null) return undefined
  const pollingInput = input as PollingInput
  const jobId = pollingInput.jobId
  return typeof jobId === 'string' && jobId.length > 0 ? jobId : undefined
}

export function evaluateRepeatedStepLoop(params: {
  previousSignature?: string
  previousRepeatCount?: number
  toolCalls: Array<{
    toolName: string
    input: unknown
    toolCallId?: string
  }>
  toolResults: Array<{
    toolName: string
    content: unknown
    toolCallId?: string
  }>
  isThinkOnly: boolean
  responseText: string
  shouldEndTurn: boolean
}): {
  signature?: string
  repeatCount: number
  shouldStop: boolean
} {
  if (params.shouldEndTurn) {
    return { signature: undefined, repeatCount: 0, shouldStop: false }
  }

  // Pre-compute which tool calls are polling calls keyed by jobId so we can
  // collapse their intentionally-varying wait_for/timeout/cursor/chunk
  // content down to a stable (toolName, jobId) signature. Different jobIds
  // remain distinct so switching jobs resets the no-progress count.
  const pollingJobIds = params.toolCalls.map(({ toolName, input }) =>
    extractPollingJobId(toolName, input),
  )

  // Match tool results back to the tool calls they came from. Results may
  // arrive in a different order than calls (parallel/out-of-order batches,
  // ToolsWhichWontForceNextStep entries), so we cannot index pollingJobIds by
  // result position. Correlate by toolCallId when every call carries one;
  // otherwise fall back to positional correlation only when the two arrays
  // have equal length (a length mismatch makes positional correlation
  // ambiguous, so no result is treated as a poll result and poll content is
  // left raw).
  const allCallsHaveIds = params.toolCalls.every(
    (call) => typeof call.toolCallId === 'string' && call.toolCallId.length > 0,
  )
  const allResultsHaveIds = params.toolResults.every(
    (result) =>
      typeof result.toolCallId === 'string' && result.toolCallId.length > 0,
  )
  let resultIsPolling: boolean[] | undefined
  if (allCallsHaveIds && allResultsHaveIds) {
    const pollingByCallId = new Map<string, boolean>()
    params.toolCalls.forEach((call, index) => {
      if (typeof call.toolCallId === 'string') {
        pollingByCallId.set(call.toolCallId, pollingJobIds[index] !== undefined)
      }
    })
    resultIsPolling = params.toolResults.map(
      (result) =>
        typeof result.toolCallId === 'string' &&
        pollingByCallId.get(result.toolCallId) === true,
    )
  } else if (
    params.toolCalls.length === params.toolResults.length &&
    params.toolCalls.length > 0
  ) {
    // Lengths match and no IDs are available: positional correlation is valid.
    resultIsPolling = params.toolResults.map(
      (_, index) => pollingJobIds[index] !== undefined,
    )
  }

  // Sort tool results into call order when every result carries a
  // toolCallId, so the serialized signature is stable regardless of result
  // arrival order (parallel/out-of-order batches). Results without IDs keep
  // their original positional order.
  const orderedToolResults =
    allCallsHaveIds && allResultsHaveIds
      ? [...params.toolResults].sort((a, b) => {
          const aCallIdx =
            typeof a.toolCallId === 'string'
              ? params.toolCalls.findIndex((c) => c.toolCallId === a.toolCallId)
              : -1
          const bCallIdx =
            typeof b.toolCallId === 'string'
              ? params.toolCalls.findIndex((c) => c.toolCallId === b.toolCallId)
              : -1
          return aCallIdx - bCallIdx
        })
      : params.toolResults

  // Rebuild resultIsPolling to match the sorted order when IDs are present.
  const orderedResultIsPolling =
    allCallsHaveIds && allResultsHaveIds && resultIsPolling
      ? orderedToolResults.map((result) => {
          if (typeof result.toolCallId !== 'string') return false
          const callIdx = params.toolCalls.findIndex(
            (c) => c.toolCallId === result.toolCallId,
          )
          return callIdx >= 0 && pollingJobIds[callIdx] !== undefined
        })
      : resultIsPolling

  const signaturePayload =
    params.toolCalls.length > 0
      ? {
          toolCalls: params.toolCalls.map(({ toolName, input }, index) => {
            const jobId = pollingJobIds[index]
            if (jobId !== undefined) {
              return { toolName, input: { jobId } }
            }
            return { toolName, input }
          }),
          toolResults: orderedToolResults.map(({ toolName, content }, index) =>
            orderedResultIsPolling?.[index]
              ? { toolName, content: POLLING_RESULT_MARKER }
              : { toolName, content },
          ),
        }
      : params.isThinkOnly
        ? { thinkOnly: true }
        : params.responseText.trim()
          ? { responseText: params.responseText.trim() }
          : undefined

  if (!signaturePayload) {
    return { signature: undefined, repeatCount: 0, shouldStop: false }
  }

  const signature = getContentHash(JSON.stringify(signaturePayload))
  const repeatCount =
    signature === params.previousSignature
      ? (params.previousRepeatCount ?? 0) + 1
      : 1

  return {
    signature,
    repeatCount,
    shouldStop: repeatCount >= REPEATED_STEP_LOOP_LIMIT,
  }
}
