import { describe, expect, it, spyOn } from 'bun:test'

import { withTimeout } from '../promise'

describe('withTimeout', () => {
  it('clears its timer when the wrapped promise rejects', async () => {
    const timeoutId = 123 as unknown as ReturnType<typeof setTimeout>
    const setTimeoutSpy = spyOn(globalThis, 'setTimeout').mockReturnValue(
      timeoutId,
    )
    const clearTimeoutSpy = spyOn(globalThis, 'clearTimeout')
    const error = new Error('expected rejection')

    try {
      await expect(withTimeout(Promise.reject(error), 15_000)).rejects.toBe(
        error,
      )
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutId)
    } finally {
      setTimeoutSpy.mockRestore()
      clearTimeoutSpy.mockRestore()
    }
  })
})
