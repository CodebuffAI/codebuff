import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { ADVISORY_LOCK_IDS } from '../advisory-lock'

describe('advisory-lock', () => {
  let mockConnection: {
    end: ReturnType<typeof mock>
    tagged: ReturnType<typeof mock>
  }
  let postgresMock: ReturnType<typeof mock>
  let setIntervalSpy: ReturnType<typeof spyOn>
  let clearIntervalSpy: ReturnType<typeof spyOn>
  let consoleErrorSpy: ReturnType<typeof spyOn>

  // Import the module fresh for each test
  let tryAcquireAdvisoryLock: typeof import('../advisory-lock').tryAcquireAdvisoryLock

  beforeEach(async () => {
    // Create mock connection with tagged template support
    mockConnection = {
      end: mock(() => Promise.resolve()),
      tagged: mock(() => Promise.resolve([{ acquired: true }])),
    }

    // Make the connection callable as a tagged template function
    const callableConnection = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        return mockConnection.tagged(strings, ...values)
      },
      mockConnection,
    )

    // Mock the postgres module
    postgresMock = mock(() => callableConnection)

    mock.module('postgres', () => ({
      default: postgresMock,
    }))

    // Spy on timers
    setIntervalSpy = spyOn(globalThis, 'setInterval')
    clearIntervalSpy = spyOn(globalThis, 'clearInterval')
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})

    // Re-import to get fresh module with mocks
    const module = await import('../advisory-lock')
    tryAcquireAdvisoryLock = module.tryAcquireAdvisoryLock
  })

  afterEach(() => {
    mock.restore()
  })

  describe('ADVISORY_LOCK_IDS', () => {
    it('should have a DISCORD_BOT lock ID', () => {
      expect(ADVISORY_LOCK_IDS.DISCORD_BOT).toBe(741852963)
    })
  })

  describe('tryAcquireAdvisoryLock', () => {
    describe('successful lock acquisition', () => {
      it('should return acquired: true with a valid handle', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(result.acquired).toBe(true)
        expect(result.handle).not.toBeNull()
        expect(typeof result.handle?.onLost).toBe('function')
        expect(typeof result.handle?.release).toBe('function')

        // Clean up
        await result.handle?.release()
      })

      it('should create postgres connection with correct options', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(postgresMock).toHaveBeenCalledTimes(1)
        const callArgs = postgresMock.mock.calls[0]
        expect(callArgs[1]).toEqual({
          max: 1,
          idle_timeout: 0,
          connect_timeout: 10,
          max_lifetime: 0,
        })

        await result.handle?.release()
      })

      it('should call pg_try_advisory_lock with the correct lock ID', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(mockConnection.tagged).toHaveBeenCalled()
        const [strings, lockId] = mockConnection.tagged.mock.calls[0]
        expect(strings[0]).toContain('SELECT pg_try_advisory_lock(')
        expect(lockId).toBe(ADVISORY_LOCK_IDS.DISCORD_BOT)

        await result.handle?.release()
      })

      it('should set up health check interval', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(setIntervalSpy).toHaveBeenCalledTimes(1)
        expect(setIntervalSpy.mock.calls[0][1]).toBe(10_000) // 10 seconds

        await result.handle?.release()
      })
    })

    describe('failed lock acquisition', () => {
      it('should return acquired: false when lock is held by another', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: false }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(result.acquired).toBe(false)
        expect(result.handle).toBeNull()
      })

      it('should close connection when lock not acquired', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: false }])

        await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(mockConnection.end).toHaveBeenCalledTimes(1)
      })

      it('should not set up health check when lock not acquired', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: false }])

        await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(setIntervalSpy).not.toHaveBeenCalled()
      })
    })

    describe('connection errors', () => {
      it('should throw error when connection fails', async () => {
        mockConnection.tagged.mockRejectedValue(new Error('Connection refused'))

        await expect(
          tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT),
        ).rejects.toThrow('Connection refused')
      })

      it('should close connection on error', async () => {
        mockConnection.tagged.mockRejectedValue(new Error('Connection refused'))

        try {
          await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)
        } catch {
          // Expected
        }

        expect(mockConnection.end).toHaveBeenCalledTimes(1)
      })

      it('should handle connection.end() failure on error cleanup', async () => {
        mockConnection.tagged.mockRejectedValue(new Error('Query failed'))
        mockConnection.end.mockRejectedValue(new Error('End failed'))

        // Should not throw from the end() failure
        await expect(
          tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT),
        ).rejects.toThrow('Query failed')
      })
    })

    describe('handle.release()', () => {
      it('should close connection when released', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)
        await result.handle?.release()

        expect(mockConnection.end).toHaveBeenCalledTimes(1)
      })

      it('should clear health check interval when released', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)
        await result.handle?.release()

        expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
      })

      it('should be idempotent - calling twice should not error', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)
        await result.handle?.release()
        await result.handle?.release()

        // Should only close once
        expect(mockConnection.end).toHaveBeenCalledTimes(1)
      })

      it('should handle connection.end() error gracefully', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])
        mockConnection.end.mockRejectedValue(new Error('End failed'))

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        // Should not throw
        await result.handle?.release()

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error closing database connection'),
        )
      })
    })

    describe('handle.onLost()', () => {
      it('should register callback', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: true }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)
        const lostCallback = mock(() => {})
        result.handle?.onLost(lostCallback)

        // Callback should not be called immediately
        expect(lostCallback).not.toHaveBeenCalled()

        await result.handle?.release()
      })
    })

    describe('health check mechanism', () => {
      it('should trigger onLost when health check fails', async () => {
        // First call succeeds (acquire lock), second call fails (health check)
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          return Promise.reject(new Error('Connection lost'))
        })

        // Mock setInterval to capture the callback
        let healthCheckCallback: (() => Promise<void>) | null = null
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          healthCheckCallback = callback
          return 123 as unknown as NodeJS.Timeout
        })

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        const lostCallback = mock(() => {})
        result.handle?.onLost(lostCallback)

        // Trigger the health check
        expect(healthCheckCallback).not.toBeNull()
        await healthCheckCallback!()

        expect(lostCallback).toHaveBeenCalledTimes(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Advisory lock health check failed - connection lost'),
        )
      })

      it('should close connection when health check fails', async () => {
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          return Promise.reject(new Error('Connection lost'))
        })

        let healthCheckCallback: (() => Promise<void>) | null = null
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          healthCheckCallback = callback
          return 123 as unknown as NodeJS.Timeout
        })

        await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        // Trigger the health check
        await healthCheckCallback!()

        expect(mockConnection.end).toHaveBeenCalled()
      })

      it('should clear interval when health check fails', async () => {
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          return Promise.reject(new Error('Connection lost'))
        })

        const timerId = 456
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          // Execute callback asynchronously to simulate real behavior
          setTimeout(() => callback(), 0)
          return timerId as unknown as NodeJS.Timeout
        })

        await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        // Wait for the async callback to execute
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(clearIntervalSpy).toHaveBeenCalledWith(timerId)
      })

      it('should not trigger onLost after release', async () => {
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          return Promise.reject(new Error('Connection lost'))
        })

        let healthCheckCallback: (() => Promise<void>) | null = null
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          healthCheckCallback = callback
          return 123 as unknown as NodeJS.Timeout
        })

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        const lostCallback = mock(() => {})
        result.handle?.onLost(lostCallback)

        // Release first
        await result.handle?.release()

        // Then trigger health check (should be no-op since already released)
        await healthCheckCallback!()

        expect(lostCallback).not.toHaveBeenCalled()
      })

      it('should not call onLost twice if health check fails multiple times', async () => {
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          return Promise.reject(new Error('Connection lost'))
        })

        let healthCheckCallback: (() => Promise<void>) | null = null
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          healthCheckCallback = callback
          return 123 as unknown as NodeJS.Timeout
        })

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        const lostCallback = mock(() => {})
        result.handle?.onLost(lostCallback)

        // Trigger health check twice
        await healthCheckCallback!()
        await healthCheckCallback!()

        // Should only be called once
        expect(lostCallback).toHaveBeenCalledTimes(1)
      })

      it('should do nothing when health check succeeds and lock is still held', async () => {
        // First call acquires lock, subsequent calls check lock ownership
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          // Health check returns that lock is still held
          return Promise.resolve([{ held: true }])
        })

        let healthCheckCallback: (() => Promise<void>) | null = null
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          healthCheckCallback = callback
          return 123 as unknown as NodeJS.Timeout
        })

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        const lostCallback = mock(() => {})
        result.handle?.onLost(lostCallback)

        // Trigger health check
        await healthCheckCallback!()

        expect(lostCallback).not.toHaveBeenCalled()
        expect(mockConnection.end).not.toHaveBeenCalled()

        // Clean up
        await result.handle?.release()
      })

      it('should trigger onLost when lock is no longer held', async () => {
        // First call acquires lock, subsequent calls show lock is not held
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          // Health check returns that lock is no longer held (e.g., another process took it)
          return Promise.resolve([{ held: false }])
        })

        let healthCheckCallback: (() => Promise<void>) | null = null
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          healthCheckCallback = callback
          return 123 as unknown as NodeJS.Timeout
        })

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        const lostCallback = mock(() => {})
        result.handle?.onLost(lostCallback)

        // Trigger health check
        await healthCheckCallback!()

        expect(lostCallback).toHaveBeenCalledTimes(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Advisory lock health check failed - lock no longer held'),
        )
      })

      it('should query pg_locks with correct structure in health check', async () => {
        // First call acquires lock, second call is the health check
        let callCount = 0
        mockConnection.tagged.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve([{ acquired: true }])
          }
          return Promise.resolve([{ held: true }])
        })

        let healthCheckCallback: (() => Promise<void>) | null = null
        setIntervalSpy.mockImplementation((callback: () => Promise<void>) => {
          healthCheckCallback = callback
          return 123 as unknown as NodeJS.Timeout
        })

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        // Trigger health check
        await healthCheckCallback!()

        // Verify the health check query was called (second call)
        expect(mockConnection.tagged).toHaveBeenCalledTimes(2)

        // Get the health check query (second call)
        const [queryStrings, lockIdArg] = mockConnection.tagged.mock.calls[1]
        const fullQuery = queryStrings.join('')

        // Verify the query checks pg_locks with all required conditions
        expect(fullQuery).toContain('SELECT EXISTS')
        expect(fullQuery).toContain('FROM pg_locks')
        expect(fullQuery).toContain("locktype = 'advisory'")
        expect(fullQuery).toContain('classid = 0')
        expect(fullQuery).toContain('objid =')
        expect(fullQuery).toContain('pid = pg_backend_pid()')
        expect(fullQuery).toContain('granted = true')
        expect(fullQuery).toContain('as held')

        // Verify the lock ID is passed as a parameter
        expect(lockIdArg).toBe(ADVISORY_LOCK_IDS.DISCORD_BOT)

        // Clean up
        await result.handle?.release()
      })
    })

    describe('edge cases', () => {
      it('should handle empty result from pg_try_advisory_lock', async () => {
        mockConnection.tagged.mockResolvedValue([])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(result.acquired).toBe(false)
        expect(result.handle).toBeNull()
      })

      it('should handle undefined acquired value', async () => {
        mockConnection.tagged.mockResolvedValue([{ acquired: undefined }])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(result.acquired).toBe(false)
        expect(result.handle).toBeNull()
      })

      it('should handle null result', async () => {
        mockConnection.tagged.mockResolvedValue([null])

        const result = await tryAcquireAdvisoryLock(ADVISORY_LOCK_IDS.DISCORD_BOT)

        expect(result.acquired).toBe(false)
        expect(result.handle).toBeNull()
      })
    })
  })
})
