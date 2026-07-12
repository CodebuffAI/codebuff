import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { LocalHarnessStore } from '../services/local-harness-store'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function makeRecord(revision = 0) {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1 as const,
    id: 'task-1',
    revision,
    repositoryId: 'repo-1',
    workspaceId: 'workspace-1',
    runId: 'run-1',
    snapshotId: 'snapshot-1',
    createdAt: now,
    updatedAt: now,
    phase: 'active',
  }
}

describe('LocalHarnessStore', () => {
  test('atomically persists and reads scoped records', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-harness-'))
    roots.push(root)
    const store = new LocalHarnessStore(root)
    store.put('tasks', makeRecord())

    expect(store.read('repo-1', 'tasks', 'task-1')).toMatchObject({
      id: 'task-1',
      revision: 0,
      phase: 'active',
    })
    expect(
      fs
        .readdirSync(path.join(root, 'repo-1', 'tasks'))
        .some((name) => name.includes('.tmp.')),
    ).toBe(false)
  })

  test('enforces compare-and-swap revisions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-harness-'))
    roots.push(root)
    const store = new LocalHarnessStore(root)
    store.put('tasks', makeRecord())
    expect(() => store.put('tasks', makeRecord(1), 4)).toThrow(
      'expected 4, current 0',
    )
    expect(store.put('tasks', makeRecord(1), 0).revision).toBe(1)
  })

  test('rejects traversal-shaped ids', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-harness-'))
    roots.push(root)
    const store = new LocalHarnessStore(root)
    expect(() => store.read('../repo', 'tasks', 'task-1')).toThrow(
      'Invalid harness repository id',
    )
  })

  test('rejects corrupt records instead of silently trusting them', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-harness-'))
    roots.push(root)
    const filePath = path.join(root, 'repo-1', 'tasks', 'task-1.json')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ id: 'task-1' }))
    const store = new LocalHarnessStore(root)
    expect(() => store.read('repo-1', 'tasks', 'task-1')).toThrow(
      'Invalid harness record',
    )
  })
})
