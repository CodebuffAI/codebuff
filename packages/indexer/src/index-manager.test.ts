import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterAll, describe, expect, test } from 'bun:test'

import { IndexManager } from './index-manager'
import type { EmbedFn } from './semantic'

const roots: string[] = []

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'openbuff-indexer-markstale-'))
  roots.push(root)
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(
    join(root, 'src', 'auth.ts'),
    'export function loginUser() {}\n',
  )
  return root
}

function writePackageJson(root: string, scripts: Record<string, string>): void {
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ scripts }, null, 2)}\n`,
  )
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterAll(() => {
  for (const root of roots) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
})

describe('IndexManager.markStale', () => {
  test('exposes markStale without throwing and is idempotent', () => {
    // Disabled config keeps this hermetic (no filesystem walk/build).
    const mgr = IndexManager.getInstance(
      '/tmp/openbuff-indexer-test-markstale',
      {
        enabled: false,
      },
    )
    expect(typeof mgr.markStale).toBe('function')
    mgr.markStale()
    mgr.markStale()
    // A disabled manager never builds, so query stays not-ready.
    const result = mgr.query('anything')
    expect(result.ready).toBe(false)
    expect(result.results).toEqual([])
  })

  test('waitUntilReady resolves quickly for a disabled manager even after markStale', async () => {
    const mgr = IndexManager.getInstance(
      '/tmp/openbuff-indexer-test-markstale-2',
      {
        enabled: false,
      },
    )
    mgr.markStale()
    await mgr.waitUntilReady(50)
    expect(mgr.query('x').ready).toBe(false)
  })

  test('query serves a labeled last-known-good snapshot after markStale', async () => {
    const root = makeProject()
    const mgr = IndexManager.getInstance(root, {})
    await mgr.waitUntilReady(10_000)

    const ready = mgr.query('loginUser')
    expect(ready.ready).toBe(true)
    expect(ready.results.some((result) => result.path === 'src/auth.ts')).toBe(
      true,
    )

    mgr.markStale()
    const stale = mgr.query('loginUser')
    expect(stale.ready).toBe(true)
    expect(stale.results.some((result) => result.path === 'src/auth.ts')).toBe(true)
    expect(stale.status.stale).toBe(true)
    expect(stale.totalIndexed).toBe(ready.totalIndexed)

    await mgr.waitUntilReady(10_000)
    expect(mgr.query('loginUser').ready).toBe(true)
  })

  test('query keeps serving a labeled stale snapshot while refresh is pending', async () => {
    const root = makeProject()
    const refreshGate = deferred()
    let embedCalls = 0
    let refreshEmbeddingStarted: (() => void) | undefined
    const refreshEmbedding = new Promise<void>((resolve) => {
      refreshEmbeddingStarted = resolve
    })
    const embed: EmbedFn = async (texts) => {
      embedCalls += 1
      if (embedCalls === 2) {
        refreshEmbeddingStarted?.()
        await refreshGate.promise
      }
      return texts.map(() => [1])
    }
    const mgr = IndexManager.getInstance(
      root,
      { semantic: { enabled: true } },
      embed,
    )
    await mgr.waitUntilReady(10_000)

    const ready = mgr.query('loginUser')
    expect(ready.ready).toBe(true)

    writeFileSync(
      join(root, 'src', 'auth.ts'),
      'export function loginUser() {}\nexport const changed = true\n',
    )
    mgr.markStale()
    const firstStale = mgr.query('loginUser')
    expect(firstStale.ready).toBe(true)
    expect(firstStale.status.stale).toBe(true)

    await refreshEmbedding
    const secondStale = mgr.query('loginUser')
    expect(secondStale.ready).toBe(true)
    expect(secondStale.status.stale).toBe(true)

    refreshGate.resolve()
    await mgr.waitUntilReady(10_000)
    expect(mgr.query('loginUser').ready).toBe(true)
  })

  test('command-mode queries refresh package script changes after markStale', async () => {
    const root = makeProject()
    writePackageJson(root, { typecheck: 'tsc --noEmit' })
    const mgr = IndexManager.getInstance(root, {})
    await mgr.waitUntilReady(10_000)

    const initial = mgr.query('typecheck lint', { mode: 'commands', limit: 3 })
    expect(initial.ready).toBe(true)
    expect(initial.results[0]?.path).toBe('package.json')
    expect(initial.results[0]?.matchedSnippets).toContain(
      'package script: typecheck=tsc --noEmit',
    )

    writePackageJson(root, { lint: 'eslint src --max-warnings=0' })
    const future = new Date(Date.now() + 5_000)
    utimesSync(join(root, 'package.json'), future, future)
    mgr.markStale()

    const stale = mgr.query('typecheck lint', { mode: 'commands', limit: 3 })
    expect(stale.ready).toBe(true)
    expect(stale.status.stale).toBe(true)
    expect(stale.results[0]?.matchedSnippets).toContain(
      'package script: typecheck=tsc --noEmit',
    )

    await mgr.waitUntilReady(10_000)
    const refreshed = mgr.query('typecheck lint', {
      mode: 'commands',
      limit: 3,
    })
    expect(refreshed.ready).toBe(true)
    expect(refreshed.results[0]?.path).toBe('package.json')
    expect(refreshed.results[0]?.matchedSnippets).toContain(
      'package script: lint=eslint src --max-warnings=0',
    )
    expect(refreshed.results[0]?.matchedSnippets).not.toContain(
      'package script: typecheck=tsc --noEmit',
    )
  })
})
