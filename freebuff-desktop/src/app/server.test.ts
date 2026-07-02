import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Integration tests: boot the real orchestrator (a spawned `bun server.ts`)
 * against a throwaway git repo and exercise the HTTP surface end-to-end —
 * liveness, the cross-origin guard, a thread round-trip, 404s, and SSE backfill.
 */

const PORT = 8912
const BASE = `http://127.0.0.1:${PORT}`
let repoDir: string
let homeDir: string
let proc: ReturnType<typeof Bun.spawn>

async function waitForReady(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/healthz`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('server did not become ready')
}

beforeAll(async () => {
  repoDir = mkdtempSync(join(tmpdir(), 'fb-srv-'))
  const git = (args: string[]) => Bun.spawnSync(['git', '-C', repoDir, ...args])
  Bun.spawnSync(['git', 'init', '-b', 'main', repoDir])
  git(['config', 'user.email', 't@t.co'])
  git(['config', 'user.name', 'T'])
  writeFileSync(join(repoDir, 'f.txt'), 'hi\n')
  git(['add', '-A'])
  git(['commit', '-m', 'init'])

  // Isolate HOME: the server boots an engine for EVERY project in the real
  // ~/.config/freebuff-desktop/state.json recents (restoring their tabs, some
  // mid-turn), which leaks the developer's live projects into /api/activity —
  // and each run would push this throwaway repo into their real MRU.
  homeDir = mkdtempSync(join(tmpdir(), 'fb-home-'))
  proc = Bun.spawn(['bun', join(import.meta.dir, 'server.ts')], {
    env: { ...process.env, PORT: String(PORT), TARGET_REPO: repoDir, HOME: homeDir },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await waitForReady()
})

afterAll(() => {
  proc?.kill()
  if (repoDir) rmSync(repoDir, { recursive: true, force: true })
  if (homeDir) rmSync(homeDir, { recursive: true, force: true })
})

describe('server (integration)', () => {
  test('GET /healthz is a trivial liveness probe', async () => {
    const res = await fetch(`${BASE}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  test('GET /api/state returns the engine snapshot', async () => {
    const res = await fetch(`${BASE}/api/state`)
    expect(res.status).toBe(200)
    const snap = (await res.json()) as { project?: { rootPath?: string }; threads?: unknown[] }
    expect(snap.project?.rootPath).toBe(repoDir)
    expect(Array.isArray(snap.threads)).toBe(true)
  })

  test('GET /api/activity reports idle when nothing is running', async () => {
    const res = await fetch(`${BASE}/api/activity`)
    expect(res.status).toBe(200)
    const act = (await res.json()) as { busy: boolean; running: number; queued: number }
    // A freshly-booted engine with no turns in flight is idle.
    expect(act).toEqual({ busy: false, running: 0, queued: 0 })
  })

  test('a cross-origin request to /api is rejected', async () => {
    const res = await fetch(`${BASE}/api/state`, { headers: { Origin: 'https://evil.com' } })
    expect(res.status).toBe(403)
  })

  test('a same-origin request to /api passes the guard', async () => {
    const res = await fetch(`${BASE}/api/state`, { headers: { Origin: BASE } })
    expect(res.status).toBe(200)
  })

  test('POST /api/threads creates a thread that GET then lists', async () => {
    const created = await fetch(`${BASE}/api/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Integration thread' }),
    })
    expect(created.status).toBe(200)
    const thread = (await created.json()) as { id: string; title: string }
    // Globally-unique id (one engine per repo → no per-engine `th1` counter).
    expect(thread.id).toMatch(/^th[a-z0-9]+$/)
    expect(thread.title).toBe('Integration thread')

    const list = (await (await fetch(`${BASE}/api/threads`)).json()) as { id: string }[]
    expect(list.some((t) => t.id === thread.id)).toBe(true)
  })

  test('an unknown /api route is a 404', async () => {
    const res = await fetch(`${BASE}/api/does-not-exist`)
    expect(res.status).toBe(404)
  })

  test('GET /api/events streams an initial state event', async () => {
    const res = await fetch(`${BASE}/api/events`, { headers: { Accept: 'text/event-stream' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const chunk = new TextDecoder().decode(value)
    expect(chunk).toContain('"type":"state"')
    await reader.cancel()
  })
})
