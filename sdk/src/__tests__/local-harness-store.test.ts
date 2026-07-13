import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

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

  test('quarantines corrupt records while listing healthy records', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-harness-'))
    roots.push(root)
    const store = new LocalHarnessStore(root)
    store.put('tasks', makeRecord())
    const corruptPath = path.join(root, 'repo-1', 'tasks', 'task-bad.json')
    fs.writeFileSync(corruptPath, '{not json')

    const listed = store.listWithDiagnostics('repo-1', 'tasks')
    expect(listed.records.map((record) => record.id)).toEqual(['task-1'])
    expect(listed.diagnostics).toHaveLength(1)
    expect(listed.diagnostics[0]).toMatchObject({ filePath: corruptPath })
    expect(listed.diagnostics[0]?.quarantinedPath).toBeDefined()
    expect(fs.existsSync(corruptPath)).toBe(false)
    expect(fs.existsSync(listed.diagnostics[0]!.quarantinedPath!)).toBe(true)
  })

  test('serializes compare-and-swap across processes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-harness-'))
    roots.push(root)
    const store = new LocalHarnessStore(root)
    store.put('tasks', makeRecord())
    const gate = path.join(root, 'gate')
    const servicePath = path.resolve(
      import.meta.dir,
      '..',
      'services',
      'local-harness-store.ts',
    )

    const startChild = (name: string) => {
      const ready = path.join(root, `ready-${name}`)
      const code = `
        import fs from 'node:fs';
        import { LocalHarnessStore } from ${JSON.stringify(servicePath)};
        const store = new LocalHarnessStore(${JSON.stringify(root)});
        fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
        const wait = new Int32Array(new SharedArrayBuffer(4));
        while (!fs.existsSync(${JSON.stringify(gate)})) Atomics.wait(wait, 0, 0, 5);
        const now = new Date().toISOString();
        try {
          store.put('tasks', ${JSON.stringify(makeRecord(1))}, 0);
          console.log('ok');
        } catch (error) {
          console.log(error instanceof Error ? error.message : String(error));
        }
      `
      const child = spawn(process.execPath, ['-e', code], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += String(chunk)))
      child.stderr.on('data', (chunk) => (stderr += String(chunk)))
      const completed = new Promise<string>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', (exitCode) => {
          if (exitCode === 0) resolve(stdout.trim())
          else reject(new Error(stderr || `child exited ${exitCode}`))
        })
      })
      return { ready, completed }
    }

    const first = startChild('first')
    const second = startChild('second')
    const wait = new Int32Array(new SharedArrayBuffer(4))
    const deadline = Date.now() + 5_000
    while (
      (!fs.existsSync(first.ready) || !fs.existsSync(second.ready)) &&
      Date.now() < deadline
    ) {
      Atomics.wait(wait, 0, 0, 5)
    }
    expect(fs.existsSync(first.ready)).toBe(true)
    expect(fs.existsSync(second.ready)).toBe(true)
    fs.writeFileSync(gate, 'go')

    const outcomes = await Promise.all([first.completed, second.completed])
    expect(outcomes.filter((outcome) => outcome === 'ok')).toHaveLength(1)
    expect(
      outcomes.filter((outcome) => outcome.includes('revision conflict')),
    ).toHaveLength(1)
    expect(store.read('repo-1', 'tasks', 'task-1')?.revision).toBe(1)
  })
})
