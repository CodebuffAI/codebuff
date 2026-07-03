/**
 * Routing for MiniMax M3, which serves from the Fireworks serverless API by
 * default and falls back to the official MiniMax API on rate limits.
 *
 * The fallback is sticky: once a session is pinned to MiniMax (because Fireworks
 * rate-limited it), every subsequent request goes straight to MiniMax. This
 * avoids re-paying the prompt-cache miss that a back-and-forth between upstreams
 * would incur — each provider keeps its own prompt cache, so flapping between
 * them cold-starts the cache every switch.
 *
 * The pin lives on the per-user free_session row (see `pinFreeSessionToMinimax`
 * in the free-session layer). When there is no session row (already ended or
 * swept), the pin write is a no-op and each request independently tries
 * Fireworks first.
 */
import {
  FireworksError,
  handleFireworksNonStream,
  handleFireworksStream,
} from './fireworks'
import { handleMiniMaxNonStream, handleMiniMaxStream } from './minimax'

/** A Fireworks serverless rate-limit (HTTP 429) — the signal to divert this
 *  session to the official MiniMax API. */
export function isFireworksRateLimit(error: unknown): boolean {
  return error instanceof FireworksError && error.statusCode === 429
}

type FireworksStreamArgs = Parameters<typeof handleFireworksStream>[0]
type FireworksNonStreamArgs = Parameters<typeof handleFireworksNonStream>[0]

interface M3RouteOptions {
  /** Session is already pinned to MiniMax — skip Fireworks entirely. */
  pinnedToMinimax: boolean
  /** Persist the sticky MiniMax pin for this session. Best-effort; awaited
   *  before serving so the next request reads the pin, but its failure must not
   *  break the current request. */
  onRateLimited: () => Promise<void> | void
}

export async function handleMiniMaxModelStream(
  args: FireworksStreamArgs,
  opts: M3RouteOptions,
): Promise<ReadableStream> {
  if (opts.pinnedToMinimax) {
    return handleMiniMaxStream(args)
  }
  try {
    // Await here so a 429 (thrown before any tokens stream) lands in this catch
    // rather than surfacing to the client mid-stream.
    return await handleFireworksStream(args)
  } catch (error) {
    if (!isFireworksRateLimit(error)) throw error
    args.logger.info(
      { userId: args.userId, model: args.body.model },
      '[MiniMaxM3] Fireworks serverless rate-limited; falling back to official MiniMax API and pinning session',
    )
    await opts.onRateLimited()
    return handleMiniMaxStream(args)
  }
}

export async function handleMiniMaxModelNonStream(
  args: FireworksNonStreamArgs,
  opts: M3RouteOptions,
): Promise<unknown> {
  if (opts.pinnedToMinimax) {
    return handleMiniMaxNonStream(args)
  }
  try {
    return await handleFireworksNonStream(args)
  } catch (error) {
    if (!isFireworksRateLimit(error)) throw error
    args.logger.info(
      { userId: args.userId, model: args.body.model },
      '[MiniMaxM3] Fireworks serverless rate-limited; falling back to official MiniMax API and pinning session',
    )
    await opts.onRateLimited()
    return handleMiniMaxNonStream(args)
  }
}
