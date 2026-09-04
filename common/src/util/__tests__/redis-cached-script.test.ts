import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import {
  CachedRedisScript,
  isNoScriptError,
  redisScriptSha1,
} from '../redis-cached-script'

import type { CachedScriptRedisClient } from '../redis-cached-script'

const SCRIPT = `return {0, '', 0, ''}`

/**
 * A Redis that remembers which scripts it has cached, the way the real one
 * does: `SCRIPT LOAD` and `EVAL` both cache; `EVALSHA` answers NOSCRIPT for a
 * digest it has not seen; `SCRIPT FLUSH` (here, `flush()`) forgets everything.
 */
function fakeRedis(options: { withScriptCommand?: boolean } = {}) {
  const cached = new Set<string>()
  const calls: string[] = []
  const client: CachedScriptRedisClient & {
    calls: string[]
    flush(): void
  } = {
    calls,
    flush: () => cached.clear(),
    async eval(script, numKeys, ...args) {
      calls.push(`eval:${numKeys}:${args.join(',')}`)
      cached.add(createHash('sha1').update(script).digest('hex'))
      return ['eval', ...args]
    },
    async evalsha(sha1, numKeys, ...args) {
      calls.push(`evalsha:${numKeys}:${args.join(',')}`)
      if (!cached.has(sha1)) {
        throw new Error('NOSCRIPT No matching script. Please use EVAL.')
      }
      return ['evalsha', ...args]
    },
    ...(options.withScriptCommand === false
      ? {}
      : {
          async script(subcommand: 'LOAD', script: string) {
            calls.push(`script:${subcommand}`)
            const sha = createHash('sha1').update(script).digest('hex')
            cached.add(sha)
            return sha
          },
        }),
  }
  return client
}

describe('redisScriptSha1', () => {
  test('is the SHA-1 Redis keys its cache by', () => {
    expect(redisScriptSha1(SCRIPT)).toBe(
      createHash('sha1').update(SCRIPT).digest('hex'),
    )
    expect(redisScriptSha1(SCRIPT)).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('isNoScriptError', () => {
  test('recognises the reply and nothing else', () => {
    expect(
      isNoScriptError(
        new Error('NOSCRIPT No matching script. Please use EVAL.'),
      ),
    ).toBe(true)
    expect(isNoScriptError('NOSCRIPT No matching script.')).toBe(true)
    expect(isNoScriptError(new Error('ETIMEDOUT'))).toBe(false)
    expect(isNoScriptError(new Error('ERR wrong number of arguments'))).toBe(
      false,
    )
    expect(isNoScriptError(undefined)).toBe(false)
  })
})

describe('CachedRedisScript', () => {
  test('first call loads the script, later calls use the sha alone', async () => {
    const cached = new CachedRedisScript(SCRIPT)
    const redis = fakeRedis()

    expect(await cached.run(redis, 1, 'k1', 'a')).toEqual([
      'evalsha',
      'k1',
      'a',
    ])
    expect(await cached.run(redis, 1, 'k1', 'b')).toEqual([
      'evalsha',
      'k1',
      'b',
    ])
    expect(await cached.run(redis, 1, 'k1', 'c')).toEqual([
      'evalsha',
      'k1',
      'c',
    ])

    expect(redis.calls).toEqual([
      'script:LOAD',
      'evalsha:1:k1,a',
      'evalsha:1:k1,b',
      'evalsha:1:k1,c',
    ])
    expect(cached.isLoadedOn(redis)).toBe(true)
  })

  test('a NOSCRIPT reply falls back to EVAL for that call and re-loads on the next', async () => {
    const cached = new CachedRedisScript(SCRIPT)
    const redis = fakeRedis()
    await cached.run(redis, 1, 'k1', 'a')

    // The store restarted (or SCRIPT FLUSH ran) between calls.
    redis.flush()
    expect(await cached.run(redis, 1, 'k1', 'b')).toEqual(['eval', 'k1', 'b'])
    expect(cached.isLoadedOn(redis)).toBe(false)

    // Next call loads again, then EVALSHA works.
    expect(await cached.run(redis, 1, 'k1', 'c')).toEqual([
      'evalsha',
      'k1',
      'c',
    ])
    expect(redis.calls).toEqual([
      'script:LOAD',
      'evalsha:1:k1,a',
      'evalsha:1:k1,b', // NOSCRIPT
      'eval:1:k1,b',
      'script:LOAD',
      'evalsha:1:k1,c',
    ])
  })

  test('the load is per CLIENT: a replacement client loads again', async () => {
    // The pool hands out a new object after a reset, which is exactly when
    // the store behind it may be a fresh one.
    const cached = new CachedRedisScript(SCRIPT)
    const first = fakeRedis()
    const second = fakeRedis()
    await cached.run(first, 1, 'k')
    await cached.run(second, 1, 'k')
    expect(first.calls).toEqual(['script:LOAD', 'evalsha:1:k'])
    expect(second.calls).toEqual(['script:LOAD', 'evalsha:1:k'])
  })

  test('a client without evalsha gets plain EVAL, as before', async () => {
    const cached = new CachedRedisScript(SCRIPT)
    const calls: string[] = []
    const stub: CachedScriptRedisClient = {
      async eval(_script, numKeys, ...args) {
        calls.push(`eval:${numKeys}:${args.join(',')}`)
        return [0]
      },
    }
    expect(await cached.run(stub, 2, 'a', 'b', 'c')).toEqual([0])
    expect(await cached.run(stub, 2, 'a', 'b', 'c')).toEqual([0])
    expect(calls).toEqual(['eval:2:a,b,c', 'eval:2:a,b,c'])
  })

  test('a client with evalsha but no SCRIPT command is loaded by its first EVAL', async () => {
    const cached = new CachedRedisScript(SCRIPT)
    const redis = fakeRedis({ withScriptCommand: false })
    expect(await cached.run(redis, 1, 'k', 'a')).toEqual(['eval', 'k', 'a'])
    expect(await cached.run(redis, 1, 'k', 'b')).toEqual(['evalsha', 'k', 'b'])
    expect(redis.calls).toEqual(['eval:1:k,a', 'evalsha:1:k,b'])
  })

  test('every error other than NOSCRIPT propagates untouched', async () => {
    const cached = new CachedRedisScript(SCRIPT)
    const redis = fakeRedis()
    await cached.run(redis, 1, 'k')
    redis.evalsha = async () => {
      throw new Error('ETIMEDOUT')
    }
    await expect(cached.run(redis, 1, 'k')).rejects.toThrow('ETIMEDOUT')
    // Still considered loaded: a timeout says nothing about the cache.
    expect(cached.isLoadedOn(redis)).toBe(true)
  })

  test("a load that never resolves never resolves -- the caller's timeout owns it", async () => {
    const cached = new CachedRedisScript(SCRIPT)
    const wedged: CachedScriptRedisClient = {
      eval: () => new Promise(() => {}),
      evalsha: () => new Promise(() => {}),
      script: () => new Promise(() => {}),
    }
    const outcome = await Promise.race([
      cached.run(wedged, 1, 'k').then(() => 'resolved'),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('pending'), 20),
      ),
    ])
    expect(outcome).toBe('pending')
  })

  test('reset forgets every client', async () => {
    const cached = new CachedRedisScript(SCRIPT)
    const redis = fakeRedis()
    await cached.run(redis, 1, 'k')
    cached.reset()
    expect(cached.isLoadedOn(redis)).toBe(false)
  })
})
