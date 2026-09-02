import { sleep, withTimeout } from '@codebuff/common/util/promise'

import type { ResearchEffort } from '@codebuff/common/constants/web-search'
import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Credentials for the FutureSearch (https://futuresearch.ai) deep-research
 * provider used by the web-search pipeline. Provider *routing* (serper vs
 * futuresearch) lives in @codebuff/common/constants/web-search.
 */
export interface FutureSearchEnv {
  FUTURESEARCH_API_KEY?: string
  /** Optional override for the API base URL (defaults to the public API). */
  FUTURESEARCH_API_URL?: string
}

const FUTURESEARCH_API_BASE_URL = 'https://futuresearch.ai/api/v0'
const FETCH_TIMEOUT_MS = 30_000

// Latency ceilings (three hops, not one): a completed research run costs
//   (poll budget until status settles) + (~5s cost lookup) + (result fetch).
// That total must stay under the agent-side facade's abort timeout so the
// endpoint can answer — or cancel and report — before the client gives up:
//   - web-search path: callWebSearchAPI aborts at FETCH_TIMEOUT_MS = 30s over
//     25s poll budget -> 25s + 5s <= 30s.
//   - deep-research path: callDeepResearchAPI aborts at 6min over a 5min
//     endpoint poll budget -> 5min + 5s < 6min.
// Raise all paired constants together for longer research.
// Exported so the latency-pairing pin (web deep-research latency-pairing
// test) can assert the ceilings stay ordered against the facade timeouts.
export const POLL_BUDGET_MS = 25_000
export const COST_FETCH_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_INTERVAL_MS = 15_000
const POLL_BACKOFF_FACTOR = 1.5

// A status fetch failure must not silently abandon a running (and billing)
// research task; retry a few times, like the official futuresearch SDK does
// for this exact call, before giving up and cancelling.
const STATUS_FETCH_RETRIES = 3
const STATUS_RETRY_DELAY_MS = 500

const MAX_SOURCES = 20
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g

type ResearchDepth = 'standard' | 'deep'

const effortLevelForDepth = (
  depth: ResearchDepth,
  effort?: ResearchEffort,
): ResearchEffort => effort ?? (depth === 'deep' ? 'high' : 'low')

interface FutureSearchOperationResponse {
  task_id?: string
}

interface FutureSearchTaskStatusResponse {
  status?: string
  error?: string | null
}

interface FutureSearchTaskResultResponse {
  data?: Record<string, unknown> | Array<Record<string, unknown>> | null
  status?: string
  error?: string | null
}

interface FutureSearchRequestParams {
  url: string
  method?: 'GET' | 'POST'
  body?: unknown
  headers: Record<string, string>
  step: string
  apiContext: Record<string, unknown>
  logger: Logger
  fetch: typeof globalThis.fetch
  /** Per-request timeout; defaults to FETCH_TIMEOUT_MS. */
  timeoutMs?: number
}

const requestJson = async <T>(
  params: FutureSearchRequestParams,
): Promise<T | null> => {
  const {
    url,
    method = 'GET',
    body,
    headers,
    step,
    apiContext,
    logger,
    fetch,
    timeoutMs = FETCH_TIMEOUT_MS,
  } = params
  const fetchStartTime = Date.now()

  try {
    const response = await withTimeout(
      fetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      timeoutMs,
      `FutureSearch ${step} request timed out after ${timeoutMs}ms`,
    )
    const fetchDuration = Date.now() - fetchStartTime

    if (!response.ok) {
      let responseBody = 'Unable to read response body'
      try {
        responseBody = await response.text()
      } catch {
        // Keep the fallback message
      }
      logger.error(
        {
          ...apiContext,
          step,
          status: response.status,
          statusText: response.statusText,
          responseBody: responseBody.substring(0, 500),
          fetchDuration,
        },
        `FutureSearch ${step} request failed with ${response.status}: ${response.statusText}`,
      )
      return null
    }

    return (await response.json()) as T
  } catch (error) {
    logger.error(
      {
        ...apiContext,
        step,
        fetchDuration: Date.now() - fetchStartTime,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      `Network or other failure during FutureSearch ${step} request`,
    )
    return null
  }
}

/**
 * Best-effort cancellation of a submitted task. A research task keeps running
 * (and billing) server-side even if the caller gives up, so try to cancel it
 * whenever the wrapper abandons a task that may still be in flight. Never
 * throws — cancellation failure must not mask the original outcome.
 */
const cancelTask = async (params: {
  baseUrl: string
  taskId: string
  headers: Record<string, string>
  apiContext: Record<string, unknown>
  logger: Logger
  fetch: typeof globalThis.fetch
}): Promise<void> => {
  const { baseUrl, taskId, headers, apiContext, logger, fetch } = params
  try {
    const response = await withTimeout(
      fetch(`${baseUrl}/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers,
      }),
      FETCH_TIMEOUT_MS,
      `FutureSearch cancel request timed out after ${FETCH_TIMEOUT_MS}ms`,
    )
    if (!response.ok) {
      // 409 means the task already finished, so a non-OK is expected noise.
      logger.warn(
        { ...apiContext, taskId, status: response.status },
        `FutureSearch cancel request returned ${response.status}`,
      )
    }
  } catch (error) {
    logger.warn(
      {
        ...apiContext,
        taskId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
      },
      'FutureSearch cancel request failed',
    )
  }
}

const pollTaskStatus = async (params: {
  baseUrl: string
  taskId: string
  headers: Record<string, string>
  apiContext: Record<string, unknown>
  logger: Logger
  fetch: typeof globalThis.fetch
  pollBudgetMs?: number
  pollIntervalMs?: number
  pollMaxIntervalMs?: number
}): Promise<FutureSearchTaskStatusResponse | null> => {
  const { baseUrl, taskId, headers, apiContext, logger, fetch } = params
  const budgetMs = params.pollBudgetMs ?? POLL_BUDGET_MS
  const maxIntervalMs = params.pollMaxIntervalMs ?? POLL_MAX_INTERVAL_MS
  const startedAt = Date.now()
  let intervalMs = params.pollIntervalMs ?? POLL_INTERVAL_MS
  let consecutiveFailures = 0

  const url = `${baseUrl}/tasks/${taskId}/status`

  // Once the wrapper gives up on a task that may still be running, stop it so
  // it cannot keep burning the caller's balance, then report the outcome.
  const giveUp = async (
    reason: string,
    extra: Record<string, unknown> = {},
  ): Promise<null> => {
    await cancelTask({ baseUrl, taskId, headers, apiContext, logger, fetch })
    logger.warn(
      {
        ...apiContext,
        taskId,
        reason,
        pollDurationMs: Date.now() - startedAt,
        ...extra,
      },
      `FutureSearch task abandoned: ${reason}`,
    )
    return null
  }

  while (Date.now() - startedAt < budgetMs) {
    const status = await requestJson<FutureSearchTaskStatusResponse>({
      url,
      headers,
      step: 'status',
      apiContext,
      logger,
      fetch,
    })

    if (!status) {
      consecutiveFailures += 1
      if (consecutiveFailures >= STATUS_FETCH_RETRIES) {
        return giveUp('status fetch failed', { consecutiveFailures })
      }
      const remainingMs = budgetMs - (Date.now() - startedAt)
      if (remainingMs <= 0) break
      await sleep(
        Math.min(STATUS_RETRY_DELAY_MS * consecutiveFailures, remainingMs),
      )
      continue
    }
    consecutiveFailures = 0

    const taskStatus = status.status
    if (taskStatus === 'failed' || taskStatus === 'revoked') {
      logger.error(
        {
          ...apiContext,
          taskId,
          taskStatus,
          taskError: status.error ?? undefined,
          pollDurationMs: Date.now() - startedAt,
        },
        `FutureSearch task ${taskStatus}`,
      )
      return null
    }
    if (taskStatus === 'completed') {
      return status
    }

    // Any other status (pending, running, queued, or a future value) means the
    // task is still in flight — keep polling rather than aborting research.
    const remainingMs = budgetMs - (Date.now() - startedAt)
    if (remainingMs <= 0) break
    const jitteredIntervalMs = intervalMs * (0.9 + Math.random() * 0.2)
    await sleep(Math.min(jitteredIntervalMs, remainingMs))
    intervalMs = Math.min(intervalMs * POLL_BACKOFF_FACTOR, maxIntervalMs)
  }

  return giveUp('poll budget exhausted')
}

const extractSources = (
  text: string,
): Array<{ title: string; url: string }> => {
  const sources: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()

  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    const url = match[2]
    if (seen.has(url)) continue
    seen.add(url)
    sources.push({ title: match[1], url })
    if (sources.length >= MAX_SOURCES) break
  }

  return sources
}

interface FutureSearchContextRow {
  title: string
  content: string
}

interface FutureSearchResearchResult {
  /** JSON-formatted research result (mirroring the Serper wrapper's output). */
  result: string
  /**
   * What FutureSearch charged for this task, in dollars, once settled
   * (`GET /tasks/{id}/cost` -> cost_dollars). Null while the charge is still
   * pending or if the cost lookup failed.
   */
  costDollars: number | null
}

/**
 * Run a web research query through the FutureSearch multi-agent API.
 *
 * FutureSearch tasks are asynchronous: this submits a multi-agent research
 * task, polls the task status until it completes, and fetches the synthesized
 * answer with its markdown citations resolved.
 *
 * The multi-agent team can be steered and grounded the way the API intends:
 * `directions` become up to 6 self-contained research angles, and `context`
 * rows are fed to the agents (each is researched and the findings synthesized
 * with the query). With neither, an empty input list researches the query
 * alone. A session is auto-created by the API.
 *
 * Returns the research result plus the real task cost (or null when the
 * request fails). Callers are expected to have already verified the API key;
 * this wrapper does not substitute its own configuration guidance.
 */
export async function researchQuery(options: {
  query: string
  depth?: ResearchDepth
  /** Overrides the depth mapping ('standard' -> low, 'deep' -> high). */
  effort?: ResearchEffort
  /** Up to 6 explicit research angles; each becomes an agent's prompt. */
  directions?: string[]
  /** Prior findings/context the agents should research and build on. */
  context?: FutureSearchContextRow[]
  logger: Logger
  fetch: typeof globalThis.fetch
  serverEnv: FutureSearchEnv
  pollBudgetMs?: number
  pollIntervalMs?: number
  pollMaxIntervalMs?: number
}): Promise<FutureSearchResearchResult | null> {
  const { query, depth = 'standard', logger, fetch, serverEnv } = options
  const apiStartTime = Date.now()

  const baseUrl = (
    serverEnv.FUTURESEARCH_API_URL ?? FUTURESEARCH_API_BASE_URL
  ).replace(/\/+$/, '')
  const apiKey = serverEnv.FUTURESEARCH_API_KEY
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  const effortLevel = effortLevelForDepth(depth, options.effort)
  const apiContext = { query, depth, effortLevel, baseUrl }

  try {
    // Submit a multi-agent research task. An empty input list tells the API to
    // research the task instruction alone and synthesize one answer; context
    // rows make each row a research angle that gets synthesized with the
    // answer. `directions` steer the team with explicit agent prompts.
    const operation = await requestJson<FutureSearchOperationResponse>({
      url: `${baseUrl}/operations/multi-agent`,
      method: 'POST',
      headers,
      step: 'multi-agent',
      apiContext,
      logger,
      fetch,
      body: {
        input:
          options.context && options.context.length > 0 ? options.context : [],
        ...(options.directions && options.directions.length > 0
          ? { directions: options.directions }
          : {}),
        task: `Research the following question and answer it with inline citations to the sources you used, and include the source URLs:\n\n${query}`,
        effort_level: effortLevel,
        join_with_input: true,
        return_list: false,
      },
    })
    if (!operation) return null
    if (!operation.task_id) {
      logger.error(
        { ...apiContext, operationBody: operation },
        'FutureSearch multi-agent response missing task_id',
      )
      return null
    }
    const taskId = operation.task_id

    // Poll until the research task settles.
    const finalStatus = await pollTaskStatus({
      baseUrl,
      taskId,
      headers,
      apiContext,
      logger,
      fetch,
      pollBudgetMs: options.pollBudgetMs,
      pollIntervalMs: options.pollIntervalMs,
      pollMaxIntervalMs: options.pollMaxIntervalMs,
    })
    if (!finalStatus) return null

    // Fetch the synthesized answer. The default response schema produces an
    // object with an `answer` field (citations resolved to markdown links).
    const taskResult = await requestJson<FutureSearchTaskResultResponse>({
      url: `${baseUrl}/tasks/${taskId}/result`,
      headers,
      step: 'result',
      apiContext,
      logger,
      fetch,
    })
    if (!taskResult) return null

    const row = Array.isArray(taskResult.data)
      ? taskResult.data[0]
      : taskResult.data
    const answer =
      typeof row?.answer === 'string' && row.answer.trim()
        ? row.answer
        : undefined
    const answerText =
      answer ?? (row ? JSON.stringify(row, null, 2) : undefined)

    if (!answerText) {
      logger.warn(
        { ...apiContext, taskId, taskStatus: taskResult.status ?? undefined },
        'FutureSearch task completed without a usable answer',
      )
      return null
    }

    const sources = extractSources(answerText)

    // The task is settled by now, so its cost is final — but the lookup is
    // best-effort: a blip here must not discard a completed research run.
    // `GET /tasks/{id}/cost` returns { status: pending|settled, cost_dollars }.
    // Bounded by COST_FETCH_TIMEOUT_MS (not FETCH_TIMEOUT_MS) so the extra hop
    // cannot push the whole call past the facade's abort window.
    let costDollars: number | null = null
    const cost = await requestJson<{
      status?: string
      cost_dollars?: number | null
    }>({
      url: `${baseUrl}/tasks/${taskId}/cost`,
      headers,
      step: 'cost',
      apiContext,
      logger,
      fetch,
      timeoutMs: COST_FETCH_TIMEOUT_MS,
    })
    if (cost && typeof cost.cost_dollars === 'number') {
      costDollars = cost.cost_dollars
    } else if (cost) {
      // A missing cost response is only worth a warn when the lookup itself
      // succeeded (pending/missing cost); a fetch failure was already logged
      // by requestJson.
      logger.warn(
        { ...apiContext, taskId, costStatus: cost.status ?? undefined },
        'FutureSearch task cost is not settled or unavailable',
      )
    }

    const result = JSON.stringify(
      {
        provider: 'futuresearch',
        query,
        depth,
        effortLevel,
        answer: answerText,
        ...(sources.length > 0 ? { sources } : {}),
        // Deliberately named `researchCostDollars` (not `costDollars`): this
        // key lives INSIDE the result document that the agent parses, while
        // `costDollars` is the API-contract field on the /deep-research
        // response envelope. Two surfaces, two names, so a model rendering the
        // inner JSON cannot confuse the two — see docs/web-search-architecture.md.
        researchCostDollars: costDollars,
      },
      null,
      2,
    )

    logger.info(
      {
        ...apiContext,
        taskId,
        answerLength: answerText.length,
        sourceCount: sources.length,
        costDollars,
        totalDuration: Date.now() - apiStartTime,
        success: true,
      },
      'Completed FutureSearch research',
    )

    return { result, costDollars }
  } catch (error) {
    logger.error(
      {
        ...apiContext,
        totalDuration: Date.now() - apiStartTime,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
        success: false,
      },
      'Network or other failure during FutureSearch research',
    )
    return null
  }
}
