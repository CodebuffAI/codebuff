import { describe, expect, it } from 'bun:test'

import { runAttachmentSweep } from '@/server/chat/attachment-sweep'

import type { AttachmentSweepDeps } from '@/server/chat/attachment-sweep'
import type { ExpiredAttachmentBatchRow } from '@/server/chat/store'

const CUTOFF = new Date('2026-01-31T00:00:00Z')

/** Builds deps backed by an in-memory list of expired messages. `listExpired`
 *  returns the oldest `limit` un-cleared messages and respects `clearRefs`
 *  (mirroring how clearing makes the sweep idempotent in the real DB). */
function makeDeps(messages: ExpiredAttachmentBatchRow[]): {
  deps: AttachmentSweepDeps
  calls: { deleted: string[][]; cleared: string[][]; order: string[] }
} {
  const cleared = new Set<string>()
  const calls = {
    deleted: [] as string[][],
    cleared: [] as string[][],
    order: [] as string[],
  }
  const deps: AttachmentSweepDeps = {
    listExpired: async (_cutoff, limit) =>
      messages.filter((m) => !cleared.has(m.id)).slice(0, limit),
    deleteBlobs: async (ids) => {
      calls.deleted.push(ids)
      calls.order.push('delete')
    },
    clearRefs: async (ids) => {
      ids.forEach((id) => cleared.add(id))
      calls.cleared.push(ids)
      calls.order.push('clear')
    },
  }
  return { deps, calls }
}

function row(id: string, ...storageIds: string[]): ExpiredAttachmentBatchRow {
  return { id, storageIds }
}

describe('runAttachmentSweep', () => {
  it('sweeps a single short batch and reports counts', async () => {
    const { deps, calls } = makeDeps([row('m1', 'a', 'b'), row('m2', 'c')])
    const res = await runAttachmentSweep(deps, {
      cutoff: CUTOFF,
      batchSize: 500,
      maxBatches: 20,
    })
    expect(res).toEqual({
      sweptMessages: 2,
      deletedBlobs: 3,
      batches: 1,
      capped: false,
    })
    expect(calls.deleted).toEqual([['a', 'b', 'c']])
    expect(calls.cleared).toEqual([['m1', 'm2']])
  })

  it('deletes blobs BEFORE clearing refs', async () => {
    const { deps, calls } = makeDeps([row('m1', 'a')])
    await runAttachmentSweep(deps, {
      cutoff: CUTOFF,
      batchSize: 500,
      maxBatches: 20,
    })
    expect(calls.order).toEqual(['delete', 'clear'])
  })

  it('loops across multiple batches until drained', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => row(`m${i}`, `s${i}`))
    const { deps, calls } = makeDeps(msgs)
    const res = await runAttachmentSweep(deps, {
      cutoff: CUTOFF,
      batchSize: 2,
      maxBatches: 20,
    })
    // 5 messages / batch size 2 → batches of 2, 2, 1.
    expect(res.sweptMessages).toBe(5)
    expect(res.deletedBlobs).toBe(5)
    expect(res.batches).toBe(3)
    expect(res.capped).toBe(false)
    expect(calls.cleared).toEqual([['m0', 'm1'], ['m2', 'm3'], ['m4']])
  })

  it('caps at maxBatches and flags capped=true when more remain', async () => {
    const msgs = Array.from({ length: 10 }, (_, i) => row(`m${i}`, `s${i}`))
    const { deps } = makeDeps(msgs)
    const res = await runAttachmentSweep(deps, {
      cutoff: CUTOFF,
      batchSize: 2,
      maxBatches: 2,
    })
    // Only 2 batches of 2 processed; 6 messages remain for the next run.
    expect(res.sweptMessages).toBe(4)
    expect(res.batches).toBe(2)
    expect(res.capped).toBe(true)
  })

  it('skips the blob delete when a batch has no storage ids', async () => {
    const { deps, calls } = makeDeps([row('m1')]) // no storageIds
    const res = await runAttachmentSweep(deps, {
      cutoff: CUTOFF,
      batchSize: 500,
      maxBatches: 20,
    })
    expect(res.deletedBlobs).toBe(0)
    expect(calls.deleted).toEqual([]) // deleteBlobs not called
    expect(calls.cleared).toEqual([['m1']]) // refs still cleared
  })

  it('does nothing when there is nothing expired', async () => {
    const { deps, calls } = makeDeps([])
    const res = await runAttachmentSweep(deps, {
      cutoff: CUTOFF,
      batchSize: 500,
      maxBatches: 20,
    })
    expect(res).toEqual({
      sweptMessages: 0,
      deletedBlobs: 0,
      batches: 0,
      capped: false,
    })
    expect(calls.order).toEqual([])
  })
})
