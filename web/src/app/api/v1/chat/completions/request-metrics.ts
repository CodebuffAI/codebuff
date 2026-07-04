import os from 'os'

import { getErrorObject } from '@codebuff/common/util/error'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const HOSTNAME = os.hostname()
const DEFAULT_LOG_SAMPLE_RATE = 0.05

let activeChatCompletionRequests = 0
let nextRequestSequence = 0

type RequestMetricsParams = {
  logger: Logger
  userId: string
  agentId: string
  runId: string
  model: string
  streaming: boolean
  costMode: string | undefined
  /** Ingress→handler wait (from X-Request-Start), when the proxy provides it.
   *  See util/request-queue-time.ts — this is the only place instance-level
   *  backpressure is visible; handler timers start after dequeue. */
  queueMs?: number
  /** Declared request body size (Content-Length). Disambiguates queueMs:
   *  X-Request-Start is stamped at header arrival, so queueMs includes body
   *  upload — a large body inflates it independent of backpressure. */
  contentBytes?: number
  logSampleRate?: number
}

type EndReason = 'completed' | 'cancelled' | 'error'

export function beginChatCompletionRequestMetrics({
  logger,
  userId,
  agentId,
  runId,
  model,
  streaming,
  costMode,
  queueMs,
  contentBytes,
  logSampleRate = DEFAULT_LOG_SAMPLE_RATE,
}: RequestMetricsParams) {
  const requestSequence = ++nextRequestSequence
  const startedAt = Date.now()
  activeChatCompletionRequests += 1
  const activeRequestsAtStart = activeChatCompletionRequests
  const normalizedLogSampleRate = Math.max(0, Math.min(1, logSampleRate))
  // Long queue waits are the saturation signal we're hunting; never let the
  // sample rate drop them.
  const shouldLog =
    Math.random() < normalizedLogSampleRate ||
    (queueMs !== undefined && queueMs >= 5_000)

  const baseFields = {
    metric: 'chat_completion_concurrency',
    host: HOSTNAME,
    pid: process.pid,
    requestSequence,
    userId,
    agentId,
    runId,
    model,
    streaming,
    costMode,
    ...(queueMs !== undefined && { queueMs }),
    ...(contentBytes !== undefined && { contentBytes }),
    logSampleRate: normalizedLogSampleRate,
  }

  if (shouldLog) {
    logger.info(
      {
        ...baseFields,
        event: 'start',
        activeChatCompletionRequests: activeRequestsAtStart,
      },
      'Chat completion request started',
    )
  }

  let ended = false

  const end = (reason: EndReason, extra?: Record<string, unknown>) => {
    if (ended) return
    ended = true
    activeChatCompletionRequests = Math.max(0, activeChatCompletionRequests - 1)

    if (!shouldLog) return

    logger.info(
      {
        ...baseFields,
        ...extra,
        event: 'finish',
        endReason: reason,
        durationMs: Date.now() - startedAt,
        activeRequestsAtStart,
        activeChatCompletionRequests,
      },
      'Chat completion request finished',
    )
  }

  return {
    end,
    wrapStream(stream: ReadableStream<Uint8Array>) {
      const reader = stream.getReader()

      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              end('completed')
              controller.close()
              return
            }
            controller.enqueue(value)
          } catch (error) {
            end('error', { error: getErrorObject(error) })
            controller.error(error)
          }
        },
        async cancel(reason) {
          end('cancelled', {
            cancelReason:
              typeof reason === 'string' ? reason : getErrorObject(reason),
          })
          await reader.cancel(reason)
        },
      })
    },
  }
}

export function getActiveChatCompletionRequestCount() {
  return activeChatCompletionRequests
}
