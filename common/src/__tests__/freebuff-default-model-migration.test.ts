import { describe, expect, test } from 'bun:test'

import { FREEBUFF_DEFAULT_MODEL_MIGRATION_ID } from '../constants/freebuff-models'
import {
  migrateSavedDefaultModel,
  type SavedModelStore,
} from '../util/freebuff-default-model-migration'

const MODELS = { previous: 'old-default', current: 'new-default' }

function memoryStore(pick?: string) {
  const state: { pick?: string; stamp?: string } = { pick }
  const writes: string[] = []
  const store: SavedModelStore = {
    readPick: () => state.pick,
    writePick: (model) => {
      writes.push(`pick=${model}`)
      state.pick = model
    },
    readStamp: () => state.stamp,
    writeStamp: (stamp) => {
      writes.push(`stamp=${stamp}`)
      state.stamp = stamp
    },
  }
  return { store, state, writes }
}

describe('migrateSavedDefaultModel', () => {
  test('moves a saved previous default to the current one and stamps the store', () => {
    const { store, state, writes } = memoryStore('old-default')
    expect(migrateSavedDefaultModel(store, MODELS)).toBe('new-default')
    expect(state).toEqual({
      pick: 'new-default',
      stamp: FREEBUFF_DEFAULT_MODEL_MIGRATION_ID,
    })
    expect(writes).toEqual([
      `stamp=${FREEBUFF_DEFAULT_MODEL_MIGRATION_ID}`,
      'pick=new-default',
    ])
  })

  test('leaves any other saved pick alone, and still stamps', () => {
    const { store, state } = memoryStore('deliberate')
    expect(migrateSavedDefaultModel(store, MODELS)).toBe('deliberate')
    expect(state.stamp).toBe(FREEBUFF_DEFAULT_MODEL_MIGRATION_ID)
  })

  test('stamps an empty store, so a later pick of the old default is a choice', () => {
    // The Web selector once skipped the stamp when nothing was stored, and a
    // first post-flip pick of the old default was rewritten on the next read.
    const { store, state, writes } = memoryStore()
    expect(migrateSavedDefaultModel(store, MODELS)).toBeUndefined()
    expect(state.stamp).toBe(FREEBUFF_DEFAULT_MODEL_MIGRATION_ID)
    store.writePick('old-default')
    expect(migrateSavedDefaultModel(store, MODELS)).toBe('old-default')
    // No writes after the stamp beyond the user's own.
    expect(writes).toEqual([
      `stamp=${FREEBUFF_DEFAULT_MODEL_MIGRATION_ID}`,
      'pick=old-default',
    ])
  })

  test('is a pure read once stamped', () => {
    const { store, writes } = memoryStore('old-default')
    migrateSavedDefaultModel(store, MODELS)
    const before = writes.length
    expect(migrateSavedDefaultModel(store, MODELS)).toBe('new-default')
    expect(writes.length).toBe(before)
  })
})
