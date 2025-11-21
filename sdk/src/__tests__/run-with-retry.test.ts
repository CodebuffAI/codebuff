import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { ErrorCodes, NetworkError } from '../errors'
import { run } from '../run'
import * as runModule from '../run'

import type { RunState } from '../run-state'

const baseOptions = {
  apiKey: 'test-key',
  fingerprintId: 'fp',
  agent: 'base',
  prompt: 'hi',
} as const

describe('run retry wrapper', () => {
  afterEach(() => {
    mock.restore()
  })

  it('returns immediately on success without retrying', async () => {
    const expectedState = { sessionState: {} as any, output: { type: 'lastMessage', value: 'hi' } } as RunState
    const runSpy = spyOn(runModule, 'runOnce').mockResolvedValueOnce(expectedState)

    const result = await run(baseOptions)

    expect(result).toBe(expectedState)
    expect(runSpy).toHaveBeenCalledTimes(1)
  })

  it('retries once on retryable network error and then succeeds', async () => {
    const expectedState = { sessionState: {} as any, output: { type: 'lastMessage', value: 'hi' } } as RunState
    const runSpy = spyOn(runModule, 'runOnce')
      .mockRejectedValueOnce(
        new NetworkError('temporary', ErrorCodes.NETWORK_ERROR),
      )
      .mockResolvedValueOnce(expectedState)

    const result = await run({
      ...baseOptions,
      retry: { backoffBaseMs: 1, backoffMaxMs: 2 },
    })

    expect(result).toBe(expectedState)
    expect(runSpy).toHaveBeenCalledTimes(2)
  })

  it('stops after max retries are exhausted', async () => {
    const runSpy = spyOn(runModule, 'runOnce').mockRejectedValue(
      new NetworkError('offline', ErrorCodes.NETWORK_ERROR),
    )

    await expect(
      run({
        ...baseOptions,
        retry: { maxRetries: 1, backoffBaseMs: 1, backoffMaxMs: 1 },
      }),
    ).rejects.toBeInstanceOf(NetworkError)

    // Initial attempt + one retry
    expect(runSpy).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-network errors', async () => {
    const error = new Error('boom')
    const runSpy = spyOn(runModule, 'runOnce').mockRejectedValue(error)

    await expect(
      run({
        ...baseOptions,
        retry: { maxRetries: 3, backoffBaseMs: 1, backoffMaxMs: 1 },
      }),
    ).rejects.toBe(error)

    expect(runSpy).toHaveBeenCalledTimes(1)
  })

  it('skips retry when retry is false even for retryable errors', async () => {
    const runSpy = spyOn(runModule, 'runOnce').mockRejectedValue(
      new NetworkError('offline', ErrorCodes.NETWORK_ERROR),
    )

    await expect(
      run({
        ...baseOptions,
        retry: false,
      }),
    ).rejects.toBeInstanceOf(NetworkError)

    expect(runSpy).toHaveBeenCalledTimes(1)
  })

  it('retries when provided custom retryableErrorCodes set', async () => {
    const expectedState = { sessionState: {} as any, output: { type: 'lastMessage', value: 'hi' } } as RunState
    const runSpy = spyOn(runModule, 'runOnce')
      .mockRejectedValueOnce(
        new NetworkError('temporary', ErrorCodes.SERVER_ERROR),
      )
      .mockResolvedValueOnce(expectedState)

    const result = await run({
      ...baseOptions,
      retry: {
        backoffBaseMs: 1,
        backoffMaxMs: 2,
        retryableErrorCodes: new Set([ErrorCodes.SERVER_ERROR]),
      },
    })

    expect(result).toBe(expectedState)
    expect(runSpy).toHaveBeenCalledTimes(2)
  })

  it('honors abort controller during backoff', async () => {
    const runSpy = spyOn(runModule, 'runOnce').mockRejectedValue(
      new NetworkError('offline', ErrorCodes.NETWORK_ERROR),
    )
    const controller = new AbortController()

    const promise = run({
      ...baseOptions,
      retry: { backoffBaseMs: 20, backoffMaxMs: 20 },
      abortController: controller,
    })

    controller.abort('cancelled')

    await expect(promise).rejects.toHaveProperty('name', 'AbortError')
    expect(runSpy).toHaveBeenCalledTimes(1)
  })
})
