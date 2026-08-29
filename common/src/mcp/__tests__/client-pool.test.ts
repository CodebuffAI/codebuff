import { describe, expect, it } from 'bun:test'

import { MCPClientPool } from '../client-pool'

type Config = { id: string }
type FakeClient = { id: string }

describe('MCPClientPool', () => {
  it('deduplicates concurrent connections and reports ready status', async () => {
    let connects = 0
    const pool = new MCPClientPool<FakeClient, Config>({
      keyOf: (config) => config.id,
      connect: async (config) => {
        connects++
        await Bun.sleep(5)
        return { id: config.id }
      },
      close: async () => {},
    })

    const [first, second] = await Promise.all([
      pool.get({ id: 'docs' }),
      pool.get({ id: 'docs' }),
    ])

    expect(connects).toBe(1)
    expect(first.client).toBe(second.client)
    expect(pool.statuses()).toEqual([
      expect.objectContaining({ id: 'docs', state: 'ready' }),
    ])
  })

  it('removes failed connections so the next request can retry', async () => {
    let attempts = 0
    const pool = new MCPClientPool<FakeClient, Config>({
      keyOf: (config) => config.id,
      connect: async (config) => {
        attempts++
        if (attempts === 1) throw new Error('offline')
        return { id: config.id }
      },
      close: async () => {},
    })

    await expect(pool.get({ id: 'retry' })).rejects.toThrow('offline')
    expect((await pool.get({ id: 'retry' })).client.id).toBe('retry')
    expect(attempts).toBe(2)
  })

  it('closes one or every live client', async () => {
    const closed: string[] = []
    const pool = new MCPClientPool<FakeClient, Config>({
      keyOf: (config) => config.id,
      connect: async (config) => ({ id: config.id }),
      close: async (client) => {
        closed.push(client.id)
      },
    })

    await pool.get({ id: 'one' })
    await pool.get({ id: 'two' })
    expect(await pool.close('one')).toBe(true)
    await pool.closeAll()

    expect(closed.sort()).toEqual(['one', 'two'])
    expect(pool.statuses()).toEqual([])
  })

  it('times out a stalled connection and allows a later retry', async () => {
    let shouldHang = true
    const pool = new MCPClientPool<FakeClient, Config>(
      {
        keyOf: (config) => config.id,
        connect: async (config) => {
          if (shouldHang) await new Promise(() => {})
          return { id: config.id }
        },
        close: async () => {},
      },
      { connectTimeoutMs: 10 },
    )

    await expect(pool.get({ id: 'slow' })).rejects.toThrow(
      'MCP connection timed out',
    )
    shouldHang = false
    expect((await pool.get({ id: 'slow' })).client.id).toBe('slow')
  })
})
