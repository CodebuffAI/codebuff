/**
 * Classification of completion-stream endings that would otherwise silently
 * end the turn with nothing visible to the user. Two classes:
 *
 * **'stream-interrupted'** — the connection was cut mid-response. A healthy
 * OpenAI-compatible SSE stream always ends with a chunk carrying a real
 * `finish_reason` (and, on our backend, usage totals) before `[DONE]`. When
 * the connection dies mid-stream — a server deploy killing the instance, a
 * proxy timeout, a network drop — the HTTP body just ends: the AI SDK
 * provider's flush then emits a `finish` part with finishReason `'unknown'`
 * and no usage, and the stream otherwise looks like a normal completion.
 * `'unknown'` alone is not proof: providers map any unrecognized
 * `finish_reason` string to `'unknown'` too. Usage disambiguates — it arrives
 * in the stream's final chunk, so `'unknown'` *with* usage means an odd but
 * complete stream, while `'unknown'` *without* usage means the tail was never
 * received. A missing finish part altogether is always an interruption.
 *
 * **'output-limit'** — the model spent its entire output budget on reasoning:
 * the stream finished with reason 'length' having produced no text and no
 * tool calls. A complete, well-formed stream, but the turn would end with
 * nothing visible, exactly like a cut. Only reasoning-only completions
 * qualify: a 'length' stop after real output is the answer running long,
 * which is not silently recoverable (retrying would duplicate output).
 *
 * Before this existed, both classes read as the agent "randomly stopping"
 * mid-thinking with no error anywhere (2026-07-17 incident).
 */

import type { StreamRecoverySource } from '@codebuff/common/types/contracts/llm'
import { isTransientNetworkError } from '@codebuff/common/util/error'

export interface StreamFinishInfo {
  finishReason: string
  hasUsage: boolean
}

/** Distill an AI SDK fullStream `finish` part into what detection needs. */
export function streamFinishInfoOf(part: {
  finishReason: string
  totalUsage: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}): StreamFinishInfo {
  const { inputTokens, outputTokens, totalTokens } = part.totalUsage
  return {
    finishReason: part.finishReason,
    hasUsage: [inputTokens, outputTokens, totalTokens].some(
      (tokens) => typeof tokens === 'number' && Number.isFinite(tokens),
    ),
  }
}

export interface StreamEndRecovery {
  source: StreamRecoverySource
  /** Injected into the conversation (and shown to the user). Written for the
   *  model: the retry step sees its own partial output plus this note. */
  message: string
}

const STREAM_INTERRUPTED_RECOVERY: StreamEndRecovery = {
  source: 'stream-interrupted',
  message:
    'The connection dropped while the response was streaming, so the output above may be cut off mid-thought. Continue from where it left off (or start the step over if nothing useful arrived).',
}

const OUTPUT_LIMIT_RECOVERY: StreamEndRecovery = {
  source: 'output-limit',
  // The actionable instruction is a tighter budget on the redo: finishing the
  // same depth of reasoning would hit the same limit again.
  message:
    'The response hit its output token limit while still reasoning, so no answer was produced. Redo this step thinking much more briefly, and get to the response or tool calls quickly.',
}

/**
 * Decide whether a completed fullStream ended in a recoverable silent stop.
 * Returns the recovery to yield as an error chunk, or null for normal
 * endings. A user cancel (`aborted`) also ends streams early and is never a
 * recovery.
 */
export function classifyStreamEndRecovery(params: {
  aborted: boolean
  /** Info from the stream's `finish` part, or undefined if none arrived. */
  finish: StreamFinishInfo | undefined
  yieldedText: boolean
  yieldedToolCall: boolean
}): StreamEndRecovery | null {
  const { aborted, finish, yieldedText, yieldedToolCall } = params
  if (aborted) return null

  const interrupted =
    finish === undefined ||
    (finish.finishReason === 'unknown' && !finish.hasUsage)
  if (interrupted) return STREAM_INTERRUPTED_RECOVERY

  const reasoningOnlyLength =
    finish.finishReason === 'length' && !yieldedText && !yieldedToolCall
  if (reasoningOnlyLength) return OUTPUT_LIMIT_RECOVERY

  return null
}

/**
 * Classify an exception thrown while consuming a completion stream. Some
 * runtimes surface a severed response body as an exception (for example Bun's
 * `ConnectionClosed` / `ECONNRESET`) instead of the graceful-but-incomplete
 * stream ending handled by {@link classifyStreamEndRecovery}. Both represent
 * the same recoverable condition to the agent loop.
 */
export function classifyThrownStreamRecovery(params: {
  aborted: boolean
  error: unknown
}): StreamEndRecovery | null {
  if (params.aborted || !isTransientNetworkError(params.error)) return null
  return STREAM_INTERRUPTED_RECOVERY
}
