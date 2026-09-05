/**
 * EVALSHA with an EVAL fallback, for the Lua scripts the rate limiters run on
 * every request (COD-407).
 *
 * `EVAL` ships the whole script body on every call. For the ad-route limiter
 * that is ~1.3 KiB per ad request, impression and click, under a 500 ms
 * timeout; for the free-mode limiter it is the body of every chat completion.
 * Redis caches every script it has ever evaluated by SHA-1, so the body only
 * needs to travel once per Redis lifetime -- `EVALSHA` with the digest does
 * the rest.
 *
 * ## The protocol
 *
 * 1. The first call on a given CLIENT loads the script with `SCRIPT LOAD`,
 *    then runs `EVALSHA`. "Per client" rather than "per process" because a
 *    reset pool hands out a new client object, and that is exactly when the
 *    store may have been replaced by one that has never seen the script.
 * 2. Every later call runs `EVALSHA` alone.
 * 3. A `NOSCRIPT` reply -- the server was restarted, `SCRIPT FLUSH` ran, or a
 *    replica was promoted -- falls back to `EVAL` for THIS call (which also
 *    re-caches the body server-side) and forgets the client, so the next call
 *    loads again.
 *
 * ## What it deliberately does not change
 *
 * Every error other than `NOSCRIPT` propagates exactly as `EVAL`'s would, and
 * the caller's timeout wraps the whole sequence. A limiter that failed open on
 * a wedged Redis before fails open the same way after; a client without
 * `evalsha` (a test stub, a minimal adapter) simply gets `EVAL`, which is
 * what it got before.
 */
import { createHash } from 'node:crypto'

export type ScriptEvalArg = string | number

/**
 * The narrowest client this needs. `eval` is required -- it is the fallback
 * and the whole contract for a client that offers nothing else. `evalsha` and
 * `script` are what ioredis provides and what a stub may omit.
 */
export interface CachedScriptRedisClient {
  eval(
    script: string,
    numKeys: number,
    ...args: ScriptEvalArg[]
  ): Promise<unknown>
  evalsha?(
    sha1: string,
    numKeys: number,
    ...args: ScriptEvalArg[]
  ): Promise<unknown>
  script?(subcommand: 'LOAD', script: string): Promise<unknown>
}

/** Redis identifies a cached script by the SHA-1 of its exact bytes. */
export function redisScriptSha1(script: string): string {
  return createHash('sha1').update(script).digest('hex')
}

/**
 * `NOSCRIPT No matching script. Please use EVAL.` -- the one reply that means
 * "load it again" rather than "something is wrong".
 */
export function isNoScriptError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  return message.startsWith('NOSCRIPT')
}

/**
 * A script plus the per-client memory of where it has been loaded.
 *
 * One instance per script, at module scope. The memory is a `WeakSet` keyed
 * by client object so a pool reset (new object) re-loads, and so nothing here
 * keeps a disconnected client alive.
 */
export class CachedRedisScript {
  readonly sha1: string
  private loadedOn = new WeakSet<object>()

  constructor(readonly script: string) {
    this.sha1 = redisScriptSha1(script)
  }

  /** Whether the next call on this client would skip the load. Test seam. */
  isLoadedOn(client: object): boolean {
    return this.loadedOn.has(client)
  }

  /** Forget every client. Test seam; production never needs it. */
  reset(): void {
    // A WeakSet cannot be cleared; replace it.
    this.loadedOn = new WeakSet<object>()
  }

  async run(
    client: CachedScriptRedisClient,
    numKeys: number,
    ...args: ScriptEvalArg[]
  ): Promise<unknown> {
    if (typeof client.evalsha !== 'function') {
      return client.eval(this.script, numKeys, ...args)
    }
    if (!this.loadedOn.has(client)) {
      if (typeof client.script === 'function') {
        await client.script('LOAD', this.script)
      } else {
        // No SCRIPT command: EVAL once, which caches the body server-side as a
        // side effect, and treat the client as loaded from here on.
        const result = await client.eval(this.script, numKeys, ...args)
        this.loadedOn.add(client)
        return result
      }
      this.loadedOn.add(client)
    }
    try {
      return await client.evalsha(this.sha1, numKeys, ...args)
    } catch (error) {
      if (!isNoScriptError(error)) throw error
      // The store forgot the script. Serve THIS call with EVAL (which re-caches
      // it) and re-load on the next one, so a flush costs one wide call.
      this.loadedOn.delete(client)
      return client.eval(this.script, numKeys, ...args)
    }
  }
}
