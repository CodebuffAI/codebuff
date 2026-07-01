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

import { isHarnessId, type HarnessId } from './agents/harness'
import { isAllowedApiOrigin } from './origin-guard'
import { flushAnalytics, identifyOnLogin, initAnalytics, resetIdentity, trackEvent } from './analytics'
import { LoginManager } from './auth/login-flow'
import { getAuthToken, getAuthUser, isAuthed, logout as logoutAuth } from './auth/login-store'
import { ThreadEngine, type EngineEvent } from './thread-engine'
import {
  browseDir,
  readAgentHarness,
  readRecentProjects,
  validateProjectDir,
  writeAgentHarness,
} from './project-dir'
import { ensureSampleRepo } from './sample-repo'
import { pushRecentProject } from './project-dir'
import { isSupportedFreebuffModelId } from '@codebuff/common/constants/freebuff-models'

const PORT = Number(process.env.PORT ?? 8787)
// The built React SPA directory (index.html + hashed assets). Set by the shell in
// the packaged app. In dev this is unset — Vite serves the UI and proxies here.
const UI_DIR = process.env.FREEBUFF_UI_DIR ?? join(import.meta.dir, '..', '..', 'dist-ui')

function defaultRepo(): string {
  return join(process.env.HOME ?? '/tmp', 'freebuff-desktop-demo')
}
const initialRepo = process.env.TARGET_REPO ?? readRecentProjects()[0] ?? defaultRepo()
if (initialRepo === defaultRepo()) await ensureSampleRepo(initialRepo)

// — Engine lifecycle —
// SSE subscribers live at the server level (not on a single engine), so events
// from every project's engine fan out to all connected clients over one stream.
const subscribers = new Set<(e: EngineEvent) => void>()
const broadcast = (e: EngineEvent) => {
  for (const s of subscribers) s(e)
}

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
})

// Restore every recently-open project (each its own tab set), so a relaunch
// reopens all the tabs. Validation spawns git per repo, so open them
// concurrently; the new-tab default is set explicitly afterward.
const toOpen = readRecentProjects()
if (!toOpen.includes(initialRepo)) toOpen.unshift(initialRepo)
await Promise.all(
  toOpen.map(async (dir) => {
    const r = await registry.ensure(dir)
    if (!r.ok) console.warn(`Skipping project ${dir}: ${r.error}`)
  }),
)
// Make the initial repo the new-tab default + MRU head.
registry.markRecent(initialRepo)

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
      let send: (e: EngineEvent) => void = () => {}
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const stream = new ReadableStream({
        start(controller) {
          const cleanup = () => {
            subscribers.delete(send)
            if (heartbeat) clearInterval(heartbeat)
          }
          send = (e: EngineEvent) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(e)}\n\n`)
            } catch {
              cleanup()
            }
          }
          // Initial state + a thread event per open thread (across every project)
          // so a (re)connecting client backfills everything it missed.
          registry.replay(send)
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
      return servePreview(owner?.engine.getThread(threadId)?.worktreePath ?? owner?.path ?? defaultRepo(), sub ?? '/')
    }

    // Live preview of the default project's own files (web projects).
    if (pathname === '/preview' || pathname.startsWith('/preview/')) {
      const root = registry.defaultPath() ?? defaultRepo()
      return servePreview(root, pathname === '/preview' ? '/' : pathname.slice('/preview'.length))
    }

    if (pathname === '/api/state') {
      const e = registry.defaultEngine()
      return e ? json(e.snapshot()) : json({ error: 'no project' }, 404)
    }

    if (pathname === '/api/fs/list') {
      return json(browseDir(url.searchParams.get('path') ?? undefined))
    }

    // Validate a directory (for the folder picker) without opening it.
    if (pathname === '/api/project/validate') {
      const dir = url.searchParams.get('path')
      if (!dir) return json({ error: 'path required' }, 400)
      return json(await validateProjectDir(dir))
    }

    // List the MRU of recently-opened projects so the picker can offer
    // one-click return to a previous workspace.
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

    // — Freebuff auth (device-code login) —
    if (pathname === '/api/auth/status' && req.method === 'GET') {
      return json({ authed: isAuthed(), user: getAuthUser() ?? null })
    }
    if (pathname === '/api/auth/login/start' && req.method === 'POST') {
      try {
        const { loginUrl, expiresAt } = await loginManager.start()
        return json({ ok: true, loginUrl, expiresAt })
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 502)
      }
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      // Attribute the logout to the user before clearing identity.
      trackEvent(AnalyticsEvent.DESKTOP_LOGOUT)
      resetIdentity()
      // Release the user's per-tab free-mode sessions (across every project) while
      // the token is still valid (the DELETE needs auth) so they don't linger
      // server-side until they expire/sweep. Best-effort.
      await registry.releaseFreebuffAll()
      logoutAuth()
      registry.setAuthTokenAll(undefined)
      const de = registry.defaultEngine()
      if (de) broadcast({ type: 'state', snapshot: de.snapshot() })
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
        case 'harness': {
          // Per-thread agent pick — flips which harness runs that tab's turns.
          // /api/settings/agent (above) keeps doing the project-wide default.
          const id = b.harnessId
          if (!isHarnessId(id)) return json({ error: 'invalid harnessId' }, 400)
          engine.setThreadHarness(threadId, id)
          trackEvent(AnalyticsEvent.DESKTOP_HARNESS_CHANGED, { harnessId: id, scope: 'thread' })
          return json({ ok: true })
        }
        case 'model': {
          // Per-thread Freebuff model pick. Returns the resolved model (it may be
          // downgraded to an unlimited model if another tab holds the premium
          // slot) so the optimistic UI can reconcile.
          const model = b.model
          if (typeof model !== 'string' || !isSupportedFreebuffModelId(model)) {
            return json({ error: 'invalid model' }, 400)
          }
          const result = engine.setThreadFreebuffModel(threadId, model)
          trackEvent(AnalyticsEvent.DESKTOP_MODEL_CHANGED, {
            requested: model,
            resolved: result.model,
          })
          return json({ ok: true, ...result })
        }
        case 'reorder':
          engine.reorder(threadId, String(b.itemId), b.afterItemId ? String(b.afterItemId) : null)
          return json({ ok: true })
        case 'queue':
          if (!b.prompt) return json({ error: 'prompt required' }, 400)
          return json(engine.enqueuePrompt(threadId, String(b.prompt), { label: b.label }))
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
