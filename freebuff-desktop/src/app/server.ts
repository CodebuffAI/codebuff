/**
 * Freebuff Desktop orchestrator process — HTTP + SSE server (the Bun side of the
 * Electron-shell + Bun-orchestrator split). It serves the built React UI (packaged)
 * and the thread-model API the renderer drives. In dev the Vite server owns the UI
 * and proxies /api + /preview here, so this process focuses on the API.
 *
 *   PORT=8787 bun freebuff-desktop/src/app/server.ts
 *
 * The project directory is not fixed at launch and is not global: each tab can
 * target a different local git repo. We keep one ThreadEngine per opened repo
 * (each its own DB + worktrees) in an EngineRegistry, route every thread-scoped
 * request to the engine that owns the thread, fan app-wide concerns (auth token,
 * harness default, tier) out to every engine, and remember the open set so a
 * relaunch restores all the tabs.
 */

import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { createDesktopAds } from './ads'
import { isHarnessId, type HarnessId } from './agents/harness'
import { isAllowedApiOrigin } from './origin-guard'
import { flushAnalytics, identifyOnLogin, initAnalytics, resetIdentity, trackEvent } from './analytics'
import { LoginManager } from './auth/login-flow'
import { getAuth, getAuthToken, isAuthed, logout as logoutAuth } from './auth/login-store'
import { ThreadEngine, type EngineEvent } from './thread-engine'
import {
  initProjectRepo,
  readAgentHarness,
  readRecentProjects,
  readUiPrefs,
  validateProjectDir,
  writeAgentHarness,
  writeUiPrefs,
} from './project-dir'
import { pushRecentProject } from './project-dir'
import { isSupportedFreebuffModelId } from '@codebuff/common/constants/freebuff-models'

import { isClaudeModelId } from '../core/claude-models'

const PORT = Number(process.env.PORT ?? 8787)
// The built React SPA directory (index.html + hashed assets). Set by the shell in
// the packaged app. In dev this is unset — Vite serves the UI and proxies here.
const UI_DIR = process.env.FREEBUFF_UI_DIR ?? join(import.meta.dir, '..', '..', 'dist-ui')

// — Engine lifecycle —
// SSE subscribers live at the server level (not on a single engine), so events
// from every project's engine fan out to all connected clients over one stream.
// The stream also carries an app-level `auth` event: auth state normally rides
// on engine snapshots, but with zero projects open (fresh install) there is no
// engine to snapshot — the welcome screen still needs to know whether to show
// the sign-in CTA, and to flip when the device-code flow completes.
type OutboundEvent =
  | EngineEvent
  | { type: 'auth'; authed: boolean; user: ReturnType<typeof getAuth>['user'] | null }
const authEvent = (): OutboundEvent => {
  // getAuth: one state-file read for authed+user (vs separate helper calls).
  const { authed, user } = getAuth()
  return { type: 'auth', authed, user: user ?? null }
}
const subscribers = new Set<(e: OutboundEvent) => void>()
const broadcast = (e: OutboundEvent) => {
  for (const s of subscribers) s(e)
}

// One ads client for the app: engines intersperse sponsored ads into completed
// turns with it, and the /api/ad/click route records clicks through it. Reads
// the auth token per request, so sign-in/out is picked up automatically.
const desktopAds = createDesktopAds()

// The agent harness is an app-wide choice; persist it so it survives restarts and
// apply it to every engine we stand up.
const persistedHarness = readAgentHarness()
let currentHarness: HarnessId | undefined = isHarnessId(persistedHarness) ? persistedHarness : undefined

/**
 * One ThreadEngine per opened project directory. Each tab targets a repo, so we
 * keep an engine (its own DB + worktrees) alive per project and route every
 * thread-scoped request to the engine that owns the thread. App-wide concerns
 * (auth token, harness default, access tier) are fanned out to every engine.
 *
 * Note: the Freebuff one-premium-tab soft gate is per-engine (the server backend
 * is the real authority over free-mode concurrency); cross-project premium picks
 * aren't coordinated in the optimistic UI. Acceptable for v1.
 */
class EngineRegistry {
  private engines = new Map<string, ThreadEngine>()
  /** threadId → repo path, for routing requests that only carry a thread id. */
  private threadOwner = new Map<string, string>()
  /** Most-recent project (new-tab default), cached so request paths don't hit disk. */
  private recentPath?: string

  /** Open (or return) the engine for `dir`. Validates it's a git repo first. */
  async ensure(dir: string): Promise<{ ok: boolean; path?: string; engine?: ThreadEngine; error?: string }> {
    const info = await validateProjectDir(dir)
    if (!info.ok) return { ok: false, error: info.error }
    const path = info.path
    let engine = this.engines.get(path)
    if (!engine) {
      engine = new ThreadEngine({
        repoRoot: path,
        repoUrl: path,
        defaultBranch: info.defaultBranch,
        harnessId: currentHarness,
        // browser_check loads a thread's preview from this same server.
        previewBaseUrl: `http://127.0.0.1:${PORT}`,
        // A 401 signs the whole app out, not just this engine.
        onAuthRejected: signOutOnAuthRejected,
        ads: desktopAds,
      })
      engine.store.updateProjectRunConfig('project', { test: process.env.TEST_CMD ?? 'node --test' })
      this.engines.set(path, engine)
      // Engines live for the session — there's no close-project action (a project's
      // closed threads must stay reopenable), so the subscription is never undone.
      engine.on((e) => {
        this.index(e, path)
        broadcast(e)
      })
      for (const t of engine.listThreads()) this.threadOwner.set(t.id, path)
      // Probe the Freebuff tier so the model picker reflects full vs limited access.
      void engine.refreshTier()
    }
    return { ok: true, path, engine }
  }

  /** Keep the threadId→path routing index warm from emitted events, pruning this
   *  project's entries for threads that are no longer open so the map stays bounded. */
  private index(e: EngineEvent, path: string): void {
    if (e.type === 'state') {
      const live = new Set(e.snapshot.threads.map((t) => t.id))
      for (const [id, owner] of this.threadOwner) {
        if (owner === path && !live.has(id)) this.threadOwner.delete(id)
      }
      for (const t of e.snapshot.threads) this.threadOwner.set(t.id, path)
    } else if (e.type === 'thread') {
      this.threadOwner.set(e.threadId, path)
    }
  }

  /** Mark `path` as the most-recent project (new-tab default), persisted in the MRU. */
  markRecent(path: string): void {
    this.recentPath = path
    pushRecentProject(path)
  }

  /** The engine owning `threadId`, scanning as a fallback if the index is cold. */
  forThread(threadId: string): { engine: ThreadEngine; path: string } | null {
    const known = this.threadOwner.get(threadId)
    if (known) {
      const e = this.engines.get(known)
      if (e && e.getThread(threadId)) return { engine: e, path: known }
    }
    for (const [path, e] of this.engines) {
      if (e.getThread(threadId)) {
        this.threadOwner.set(threadId, path)
        return { engine: e, path }
      }
    }
    return null
  }

  /** The engine owning queue item `itemId` (ids are globally-unique UUIDs). */
  forItem(itemId: string): ThreadEngine | null {
    for (const e of this.engines.values()) if (e.store.getQueueItem(itemId)) return e
    return null
  }

  /** Default project for a new tab / project-wide endpoints (most-recent open). */
  defaultPath(): string | undefined {
    if (this.recentPath && this.engines.has(this.recentPath)) return this.recentPath
    return this.engines.keys().next().value
  }
  defaultEngine(): ThreadEngine | undefined {
    const p = this.defaultPath()
    return p ? this.engines.get(p) : undefined
  }

  /** Every open thread across all engines (each already carries its projectPath). */
  allThreads() {
    return [...this.engines.values()].flatMap((e) => e.listThreads())
  }

  /** Aggregate work state across every engine: are any turns running or queued?
   *  Powers the desktop shell's "install when idle" updater — `busy: false`
   *  means every tab (across all projects) has stopped working. */
  activity() {
    let running = 0
    let queued = 0
    for (const e of this.engines.values()) {
      for (const t of e.listThreads()) {
        if (t.turnState === 'running') running++
        queued += e.store.listQueueItems(t.id, 'queued').length
      }
    }
    return { busy: running > 0 || queued > 0, running, queued }
  }

  /** Re-emit current state for every engine (SSE (re)connect backfill). */
  replay(send: (e: EngineEvent) => void): void {
    for (const e of this.engines.values()) {
      send({ type: 'state', snapshot: e.snapshot() })
      for (const t of e.listThreads()) {
        send({ type: 'thread', threadId: t.id, thread: t, items: e.store.listQueueItems(t.id) })
      }
    }
  }

  // — App-wide fan-out —
  setAuthTokenAll(token: string | undefined): void {
    for (const e of this.engines.values()) e.setAuthToken(token)
  }
  setHarnessAll(id: HarnessId): void {
    for (const e of this.engines.values()) e.setHarness(id)
  }
  async releaseFreebuffAll(): Promise<void> {
    await Promise.all([...this.engines.values()].map((e) => e.releaseFreebuffSessions()))
  }
}

const registry = new EngineRegistry()

/** Shared local sign-out: reset the analytics identity, clear this host's
 *  persisted token/user, swap every open project's client off the dead bearer,
 *  and broadcast so the UI flips to the sign-in gate. Used by the logout route
 *  AND by the 401 auto sign-out — one path, so the two can't drift. Runs
 *  unconditionally (an explicit logout must clean up identity/clients even if
 *  another instance already cleared the shared token file); loop protection
 *  for the 401 path lives in its caller below. */
function signOutLocally(): void {
  resetIdentity()
  logoutAuth()
  registry.setAuthTokenAll(undefined)
  const de = registry.defaultEngine()
  if (de) broadcast({ type: 'state', snapshot: de.snapshot() })
  // Engine-independent auth flip — with zero projects open there is no
  // snapshot to broadcast, but the welcome screen must still swap to sign-in.
  broadcast(authEvent())
}

/** The 401 auto sign-out. Guarded on isAuthed(): only a real persisted
 *  sign-in for THIS host gets cleared, and the guard breaks the loop where
 *  the post-sign-out tier re-probes 401 again under the env-key fallback
 *  (never "signed in") and would re-enter here forever. */
function signOutOnAuthRejected(): void {
  if (!isAuthed()) return
  signOutLocally()
}

// Drives the device-code login flow. On success we rebuild every engine's hosted
// client with the new token, re-probe the tier, and broadcast so the UI updates.
const loginManager = new LoginManager((user) => {
  registry.setAuthTokenAll(getAuthToken())
  // Tie this install's pre-login activity to the real account, then record the
  // sign-in (mirrors the CLI's `cli.login`).
  identifyOnLogin(user)
  trackEvent(AnalyticsEvent.DESKTOP_LOGIN, {
    hasEmail: Boolean(user.email),
    hasName: Boolean(user.name),
  })
  const e = registry.defaultEngine()
  if (e) broadcast({ type: 'state', snapshot: e.snapshot() })
  // Fresh install signs in from the welcome screen before any project exists:
  // no engine, no snapshot — the auth event is what unblocks the folder pick.
  broadcast(authEvent())
})

// Restore every recently-open project (each its own tab set), so a relaunch
// reopens all the tabs. Validation spawns git per repo, so open them
// concurrently; the new-tab default is set explicitly afterward. First install
// has nothing to open — the registry starts empty and the UI's welcome screen
// drives the first folder pick. There is deliberately NO env override (the old
// TARGET_REPO): repos are opened at runtime (`POST /api/project/open`), and
// test instances isolate with a fresh HOME — see docs/desktop/e2e-testing.md §3a.
const toOpen = readRecentProjects()
const initialRepo = toOpen[0]
const opened = await Promise.all(
  toOpen.map(async (dir) => {
    const r = await registry.ensure(dir)
    if (!r.ok) console.warn(`Skipping project ${dir}: ${r.error}`)
    return { dir, ok: r.ok }
  }),
)
// Re-pin the most-recent project as the new-tab default + MRU head — but only
// if it actually opened. Persisting a dead path would haunt the MRU (and the
// welcome screen's recents list) on every later launch.
if (initialRepo && opened.some((o) => o.dir === initialRepo && o.ok)) {
  registry.markRecent(initialRepo)
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

async function body(req: Request): Promise<any> {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

/** Serve a static file from `root` for a preview path, guarding traversal. */
function servePreview(root: string, rel: string): Response {
  rel = decodeURIComponent((rel || '/').split('?')[0])
  if (rel.includes('..')) return new Response('Forbidden', { status: 403 })
  if (rel.endsWith('/')) rel += 'index.html'
  const full = join(root, rel)
  if (!existsSync(full)) return new Response('Not found', { status: 404 })
  return new Response(Bun.file(full))
}

/** Serve the built SPA: index.html at `/`, hashed assets by path. */
function serveUi(pathname: string): Response {
  const rel = pathname === '/' ? '/index.html' : pathname
  if (rel.includes('..')) return new Response('Forbidden', { status: 403 })
  const full = join(UI_DIR, rel)
  if (existsSync(full) && statSync(full).isFile()) {
    const ext = full.slice(full.lastIndexOf('.'))
    return new Response(readFileSync(full), {
      headers: { 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream' },
    })
  }
  // SPA fallback: serve index.html for client-side routes.
  const index = join(UI_DIR, 'index.html')
  if (existsSync(index)) {
    return new Response(readFileSync(index, 'utf8'), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return new Response('UI not built. Run `bun run ui:build` or use the Vite dev server.', {
    status: 404,
  })
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url)
    const { pathname } = url

    // Local-CSRF guard: the API runs shell (`/api/run`) and mutates the project,
    // so block any cross-origin browser request before routing. Same-origin
    // renderer calls, the dev Vite proxy, and non-browser clients pass; a page on
    // another origin (incl. DNS-rebinding) is rejected. See origin-guard.ts.
    if (pathname.startsWith('/api/') && !isAllowedApiOrigin(req.headers.get('origin'))) {
      return new Response('Forbidden: cross-origin request blocked', { status: 403 })
    }

    // Liveness probe — a trivial, dependency-free signal for the Electron shell's
    // startup wait and any monitoring, so readiness doesn't ride on serializing
    // the full engine snapshot (`/api/state`).
    if (pathname === '/healthz') return new Response('ok')

    // Lightweight activity probe for the desktop shell's "install when idle"
    // updater: are any turns running or queued across all tabs/projects?
    if (pathname === '/api/activity') return json(registry.activity())

    // — Server-Sent Events: live engine + thread state + agent activity —
    if (pathname === '/api/events') {
      let send: (e: OutboundEvent) => void = () => {}
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const stream = new ReadableStream({
        start(controller) {
          const cleanup = () => {
            subscribers.delete(send)
            if (heartbeat) clearInterval(heartbeat)
          }
          send = (e: OutboundEvent) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(e)}\n\n`)
            } catch {
              cleanup()
            }
          }
          // Initial state + a thread event per open thread (across every project)
          // so a (re)connecting client backfills everything it missed. The auth
          // event covers the zero-project case, where no snapshot carries it.
          registry.replay(send)
          send(authEvent())
          subscribers.add(send)
          // Heartbeat: an SSE comment frame (ignored by EventSource) every 25s.
          // Without traffic a half-open socket (laptop sleep, proxy drop) would
          // sit dead in `subscribers` forever; the enqueue throws on a dead
          // controller and triggers cleanup. Also keeps intermediaries from
          // dropping an idle stream.
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(': ping\n\n')
            } catch {
              cleanup()
            }
          }, 25_000)
        },
        cancel() {
          subscribers.delete(send)
          if (heartbeat) clearInterval(heartbeat)
        },
      })
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      })
    }

    // Per-thread live preview: serve files from THAT thread's git worktree, so you
    // can see a thread's in-progress work (web projects) without it touching the
    // project root. Falls back to the thread's project root before its worktree exists.
    const tpMatch = pathname.match(/^\/thread-preview\/([^/]+)(\/.*)?$/)
    if (tpMatch) {
      const [, threadId, sub] = tpMatch
      const owner = registry.forThread(threadId)
      if (!owner) return new Response('Not found', { status: 404 })
      return servePreview(owner.engine.getThread(threadId)?.worktreePath ?? owner.path, sub ?? '/')
    }

    // Live preview of the default project's own files (web projects).
    if (pathname === '/preview' || pathname.startsWith('/preview/')) {
      const root = registry.defaultPath()
      if (!root) return new Response('Not found', { status: 404 })
      return servePreview(root, pathname === '/preview' ? '/' : pathname.slice('/preview'.length))
    }

    if (pathname === '/api/state') {
      const e = registry.defaultEngine()
      return e ? json(e.snapshot()) : json({ error: 'no project' }, 404)
    }

    // Validate a directory (for the native folder chooser) without opening it.
    if (pathname === '/api/project/validate') {
      const dir = url.searchParams.get('path')
      if (!dir) return json({ error: 'path required' }, 400)
      return json(await validateProjectDir(dir))
    }

    // `git init` a folder the user picked that isn't yet a repo, so it can be
    // opened as a project.
    if (pathname === '/api/project/init' && req.method === 'POST') {
      const dir = (await body(req)).path
      if (!dir) return json({ error: 'path required' }, 400)
      return json(await initProjectRepo(String(dir)))
    }

    // List the MRU of recently-opened projects — the renderer uses it to know
    // whether the server has a default project to fall back on for new tabs.
    if (pathname === '/api/project/recents') {
      const recents = readRecentProjects()
      const current = registry.defaultPath()
      const merged = current && !recents.includes(current) ? [current, ...recents] : recents
      return json({ recents: merged })
    }

    // Open (ensure an engine for) a project without disturbing other tabs — the
    // renderer opens a new tab in it. Returns the validated absolute path.
    if (pathname === '/api/project/open' && req.method === 'POST') {
      const { path } = await body(req)
      if (!path) return json({ error: 'path required' }, 400)
      const r = await registry.ensure(String(path))
      if (!r.ok) return json(r, 400)
      registry.markRecent(r.path!)
      trackEvent(AnalyticsEvent.DESKTOP_PROJECT_OPENED)
      return json({ ok: true, path: r.path })
    }

    // Switch the agent harness (the project-wide DEFAULT for new threads).
    // Existing threads keep whatever they were pinned to via
    // /api/thread/{id}/harness — that endpoint sets one specific tab.
    if (pathname === '/api/settings/agent' && req.method === 'POST') {
      const { harnessId } = await body(req)
      if (!isHarnessId(harnessId)) return json({ error: 'invalid harnessId' }, 400)
      currentHarness = harnessId
      registry.setHarnessAll(harnessId)
      writeAgentHarness(harnessId)
      trackEvent(AnalyticsEvent.DESKTOP_HARNESS_CHANGED, { harnessId, scope: 'default' })
      return json({ ok: true, harnessId })
    }

    // Per-user UI preferences (queue-panel width, …). Persisted in the app
    // state file, not renderer localStorage: the packaged app serves the UI
    // from a random localhost port each launch, so origin-keyed storage
    // resets on every restart.
    if (pathname === '/api/settings/ui' && req.method === 'GET') {
      return json(readUiPrefs())
    }
    if (pathname === '/api/settings/ui' && req.method === 'POST') {
      const b = await body(req)
      const w = Number(b.queueWidth)
      if (!Number.isFinite(w)) return json({ error: 'queueWidth must be a number' }, 400)
      // Broad sanity clamp only — the renderer enforces its own layout min/max.
      writeUiPrefs({ queueWidth: Math.min(2000, Math.max(200, Math.round(w))) })
      return json({ ok: true })
    }

    // Ad tracking proxies. The renderer drives both (impression on first
    // display of a card, click on click-through — it opens the clickUrl
    // itself); they're proxied here because the bearer lives with the
    // orchestrator, not the renderer. Best-effort by design, and the desktop
    // funnel events fire only when the upstream call actually recorded, so
    // they reconcile with the server-side ads_* ledger.
    const adTrackMatch = pathname.match(/^\/api\/ad\/(impression|click)$/)
    if (adTrackMatch && req.method === 'POST') {
      const { impUrl } = await body(req)
      if (typeof impUrl !== 'string' || !impUrl) return json({ error: 'impUrl required' }, 400)
      const kind = adTrackMatch[1] as 'impression' | 'click'
      const ok = await (kind === 'impression'
        ? desktopAds.recordImpression(impUrl)
        : desktopAds.recordClick(impUrl))
      if (ok) {
        trackEvent(
          kind === 'impression' ? AnalyticsEvent.DESKTOP_AD_SHOWN : AnalyticsEvent.DESKTOP_AD_CLICKED,
        )
      }
      return json({ ok })
    }

    // — Freebuff auth (device-code login) —
    if (pathname === '/api/auth/status' && req.method === 'GET') {
      const { authed, user } = getAuth()
      return json({
        authed,
        user: user ?? null,
        // Surface the in-flight login attempt so a reloaded renderer can
        // restore its "waiting" state (and the cancel affordance) instead of
        // showing an idle button while the server is still polling.
        loginPending: loginManager.isPending(),
        loginExpiresAt: loginManager.pendingExpiresAt(),
      })
    }
    if (pathname === '/api/auth/login/start' && req.method === 'POST') {
      try {
        const { loginUrl, expiresAt } = await loginManager.start()
        return json({ ok: true, loginUrl, expiresAt })
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 502)
      }
    }
    if (pathname === '/api/auth/login/cancel' && req.method === 'POST') {
      loginManager.cancel()
      return json({ ok: true })
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      // Attribute the logout to the user before clearing identity.
      trackEvent(AnalyticsEvent.DESKTOP_LOGOUT)
      // Release the user's per-tab free-mode sessions (across every project) while
      // the token is still valid (the DELETE needs auth) so they don't linger
      // server-side until they expire/sweep. Best-effort. The auto sign-out
      // path skips this — a 401'd token couldn't authorize the DELETE anyway.
      await registry.releaseFreebuffAll()
      signOutLocally()
      return json({ ok: true })
    }

    // — Project settings (.freebuff/settings.json). Project-scoped; served from the
    // most-recent project's engine (the SettingsModal is app-level). —
    if (pathname === '/api/settings' && req.method === 'GET') {
      const e = registry.defaultEngine()
      if (!e) return json({ error: 'no project' }, 404)
      const r = e.settings.read()
      return json({
        path: e.settings.filePath(),
        exists: e.settings.exists(),
        settings: r.settings,
        errors: r.errors,
      })
    }
    if (pathname === '/api/settings' && req.method === 'POST') {
      const e = registry.defaultEngine()
      if (!e) return json({ error: 'no project' }, 404)
      const { settings } = await body(req)
      if (!settings || typeof settings !== 'object') {
        return json({ error: 'settings object required' }, 400)
      }
      try {
        e.settings.write(settings)
      } catch (err) {
        return json({ error: (err as Error).message }, 400)
      }
      // Broadcast so any open UI re-renders (and the next /api/state carries the
      // updated snapshot + previewReady).
      e.emitState()
      return json({ ok: true })
    }

    if (pathname === '/api/run' && req.method === 'POST') {
      const e = registry.defaultEngine()
      if (!e) return json({ error: 'no project' }, 404)
      const { command } = await body(req)
      if (!command) return json({ error: 'command required' }, 400)
      try {
        return json(await e.runShell(String(command)))
      } catch (err) {
        return json({ error: (err as Error).message }, 500)
      }
    }

    // — Threads —
    if (pathname === '/api/threads') {
      if (req.method === 'POST') {
        const b = await body(req)
        // A new tab targets a chosen directory, defaulting to the most-recent project.
        const dir = b.projectPath ? String(b.projectPath) : registry.defaultPath()
        if (!dir) return json({ error: 'no project' }, 400)
        const r = await registry.ensure(dir)
        if (!r.ok || !r.engine) return json({ error: r.error ?? 'cannot open project' }, 400)
        registry.markRecent(r.path!)
        return json(r.engine.createThread({ title: b.title }))
      }
      return json(registry.allThreads())
    }

    const threadActionMatch = pathname.match(/^\/api\/thread\/([^/]+)\/(.+)$/)
    if (threadActionMatch && req.method === 'POST') {
      const [, threadId, action] = threadActionMatch
      const owner = registry.forThread(threadId)
      if (!owner) return json({ error: 'thread not found' }, 404)
      const engine = owner.engine
      const b = await body(req)
      switch (action) {
        case 'message': {
          const text = b.text == null ? '' : String(b.text)
          const attachments = Array.isArray(b.attachments) ? b.attachments.map(String) : []
          if (!text.trim() && attachments.length === 0) {
            return json({ error: 'text or attachments required' }, 400)
          }
          engine.postMessage(threadId, text, attachments)
          return json({ ok: true })
        }
        case 'stop':
          engine.stopTurn(threadId)
          return json({ ok: true })
        case 'close':
          void engine.closeThread(threadId)
          return json({ ok: true })
        case 'rehydrate':
          engine.rehydrateThread(threadId)
          return json({ ok: true })
        case 'delete':
          void engine.deleteThread(threadId)
          return json({ ok: true })
        case 'auto-queue-suggestions':
          engine.setAutoQueueSuggestions(threadId, !!b.on)
          return json({ ok: true })
        case 'agent': {
          // Combined per-tab agent + model pick (the setup picker on a fresh
          // tab): sets the harness and — when given — the model for that harness
          // in one call, so one click never needs two round-trips. Returns the
          // resolved model (a Freebuff premium pick may be downgraded). Only
          // valid before the thread starts — after that the pick is locked.
          const id = b.harnessId
          if (!isHarnessId(id)) return json({ error: 'invalid harnessId' }, 400)
          const model = b.model == null ? undefined : String(b.model)
          if (model !== undefined) {
            const valid =
              id === 'codebuff' ? isSupportedFreebuffModelId(model) : isClaudeModelId(model)
            if (!valid) return json({ error: 'invalid model' }, 400)
          }
          const result = engine.setThreadAgent(threadId, id, model)
          // A started thread's agent/model is fixed (ThreadEngine.threadStarted):
          // surface the lock instead of silently succeeding so a stale client learns.
          if (result.locked) {
            return json({ error: 'thread already started — its agent/model is locked' }, 409)
          }
          trackEvent(AnalyticsEvent.DESKTOP_MODEL_CHANGED, {
            harnessId: id,
            requested: model ?? null,
            resolved: result.model ?? null,
            scope: 'thread',
          })
          return json({ ok: true, ...result })
        }
        case 'reorder':
          engine.reorder(threadId, String(b.itemId), b.afterItemId ? String(b.afterItemId) : null)
          return json({ ok: true })
        case 'queue': {
          const prompt = b.prompt == null ? '' : String(b.prompt)
          const attachmentPaths = Array.isArray(b.attachments) ? b.attachments.map(String) : []
          if (!prompt.trim() && attachmentPaths.length === 0) {
            return json({ error: 'prompt or attachments required' }, 400)
          }
          return json(engine.enqueuePrompt(threadId, prompt, { label: b.label, attachmentPaths }))
        }
        case 'queue/skill':
          return json(engine.enqueueSkill(threadId, String(b.skill)) ?? { error: 'unknown skill' })
        case 'skill':
          return engine.runSkill(threadId, String(b.skill))
            ? json({ ok: true })
            : json({ error: 'unknown skill' }, 400)
        case 'queue/workflow':
          return json(engine.enqueueWorkflow(threadId, String(b.workflow)))
        default:
          return json({ error: `unknown action ${action}` }, 400)
      }
    }

    const threadMatch = pathname.match(/^\/api\/thread\/([^/]+)$/)
    if (threadMatch && req.method === 'GET') {
      const data = registry.forThread(threadMatch[1])?.engine.threadData(threadMatch[1])
      return data ? json(data) : json({ error: 'not found' }, 404)
    }

    // — Queue item actions —
    const queueMatch = pathname.match(/^\/api\/queue\/([^/]+)\/([^/]+)$/)
    if (queueMatch && req.method === 'POST') {
      const [, itemId, action] = queueMatch
      const engine = registry.forItem(itemId)
      if (!engine) return json({ error: 'item not found' }, 404)
      const b = await body(req)
      switch (action) {
        case 'edit':
          engine.editItem(itemId, String(b.prompt ?? ''))
          return json({ ok: true })
        case 'delete':
          engine.deleteItem(itemId)
          return json({ ok: true })
        case 'promote':
          engine.promoteSuggestion(itemId)
          return json({ ok: true })
        case 'demote':
          engine.moveToSuggestions(itemId)
          return json({ ok: true })
        case 'send-now':
          return engine.sendNow(itemId)
            ? json({ ok: true })
            : json({ error: 'item is not queued' }, 409)
        default:
          return json({ error: `unknown action ${action}` }, 400)
      }
    }

    // — Skills, workflows & governing docs (project-scoped; served from the
    // most-recent project's engine — defaults are seeded identically per engine). —
    const primary = registry.defaultEngine()
    if (pathname === '/api/skills/search') {
      return json({ skills: primary ? await primary.searchSkills(url.searchParams.get('q') ?? '') : [] })
    }
    if (pathname === '/api/skills/install' && req.method === 'POST' && primary) {
      const b = await body(req)
      const skill = await primary.installSkill(
        String(b.source ?? ''),
        String(b.slug ?? ''),
        b.name ? String(b.name) : undefined,
      )
      return skill
        ? json({ skill, skills: primary.listSkills() })
        : json({ error: 'install failed' }, 400)
    }
    if (pathname === '/api/skills') return json(primary?.listSkills() ?? [])
    const skillMatch = pathname.match(/^\/api\/skill\/([^/]+)$/)
    if (skillMatch && req.method === 'POST' && primary) {
      const b = await body(req)
      primary.writeSkill(skillMatch[1], String(b.prompt ?? ''))
      return json({ ok: true })
    }
    if (pathname === '/api/workflows') return json(primary?.listWorkflows() ?? [])
    const workflowMatch = pathname.match(/^\/api\/workflow\/([^/]+)$/)
    if (workflowMatch && req.method === 'POST' && primary) {
      const b = await body(req)
      primary.saveWorkflow(workflowMatch[1], Array.isArray(b.skills) ? b.skills.map(String) : [])
      return json({ ok: true })
    }

    const docMatch = pathname.match(/^\/api\/doc\/([^/]+)$/)
    if (docMatch && req.method === 'POST' && primary) {
      const { content } = await body(req)
      try {
        primary.saveDoc(docMatch[1], String(content ?? ''))
        return json({ ok: true })
      } catch (err) {
        return json({ error: (err as Error).message }, 400)
      }
    }
    if (docMatch && primary) {
      return json({
        name: docMatch[1],
        content: primary.docs.read(docMatch[1] as any),
        cap: primary.docs.capFor(docMatch[1] as any),
      })
    }

    // — Built SPA (packaged). In dev, Vite serves the UI instead. —
    if (!pathname.startsWith('/api/')) return serveUi(pathname)

    return new Response('Not found', { status: 404 })
  },
})

console.log(`Freebuff Desktop orchestrator on http://localhost:${server.port}`)
console.log(`Open projects: ${registry.allThreads().length} thread(s) across ${toOpen.length} project(s)`)

// — Analytics — top of the funnel: one launch event per orchestrator start.
// Pre-login launches are captured under the install's anonymous id and aliased
// to the account on sign-in, so install→login→first-message stays a clean funnel.
initAnalytics()
trackEvent(AnalyticsEvent.DESKTOP_APP_LAUNCHED, {
  platform: process.platform,
  arch: process.arch,
  version: process.env.FREEBUFF_APP_VERSION,
  authed: isAuthed(),
})
// Graceful shutdown. SIGTERM is how the Electron shell stops the orchestrator (it
// SIGKILLs 3s later as a fallback). Registering a signal listener overrides the
// runtime's default "terminate on signal", so we MUST exit ourselves — otherwise
// Bun.serve keeps the process alive and quit hangs until the shell's SIGKILL,
// leaving a zombie that can hold the port against the next launch. Flush buffered
// PostHog events first so the launch/last events aren't lost, then exit promptly.
let shuttingDown = false
const flushAndExit = async () => {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await flushAnalytics()
  } finally {
    process.exit(0)
  }
}
process.once('SIGTERM', () => void flushAndExit())
process.once('SIGINT', () => void flushAndExit())
// `beforeExit` fires on a natural empty-loop exit (not after process.exit); flush
// best-effort without forcing an exit so a non-signal teardown still ships events.
process.once('beforeExit', () => void flushAnalytics())
