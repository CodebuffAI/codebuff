/**
 * Freebuff Desktop orchestrator process — HTTP + SSE server (the Bun side of the
 * Electron-shell + Bun-orchestrator split). It serves the built React UI (packaged)
 * and the thread-model API the renderer drives. In dev the Vite server owns the UI
 * and proxies /api + /preview here, so this process focuses on the API.
 *
 *   PORT=8787 bun freebuff-desktop/src/app/server.ts
 *
 * The project directory is not fixed at launch: the user can open any local git
 * repo from the UI. On open we tear down the engine, stand up a fresh one pointed
 * at the chosen folder, and remember it for next launch.
 */

import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import { isHarnessId, type HarnessId } from './agents/harness'
import { ThreadEngine, type EngineEvent } from './thread-engine'
import {
  browseDir,
  readAgentHarness,
  readLastProject,
  validateProjectDir,
  writeAgentHarness,
  writeLastProject,
} from './project-dir'
import { ensureSampleRepo } from './sample-repo'

const PORT = Number(process.env.PORT ?? 8787)
// The built React SPA directory (index.html + hashed assets). Set by the shell in
// the packaged app. In dev this is unset — Vite serves the UI and proxies here.
const UI_DIR = process.env.FREEBUFF_UI_DIR ?? join(import.meta.dir, '..', '..', 'dist-ui')

function defaultRepo(): string {
  return join(process.env.HOME ?? '/tmp', 'freebuff-desktop-demo')
}
const initialRepo = process.env.TARGET_REPO ?? readLastProject() ?? defaultRepo()
if (initialRepo === defaultRepo()) await ensureSampleRepo(initialRepo)

// — Engine lifecycle —
// SSE subscribers live at the server level, not on the engine, so an open-project
// swap keeps every connected client streaming from the new engine without a reconnect.
const subscribers = new Set<(e: EngineEvent) => void>()
const broadcast = (e: EngineEvent) => {
  for (const s of subscribers) s(e)
}

let currentRepo = initialRepo
// The agent harness is an app-wide choice; persist it so it survives project swaps
// and restarts, and apply it to every engine we stand up.
const persistedHarness = readAgentHarness()
let currentHarness: HarnessId | undefined = isHarnessId(persistedHarness) ? persistedHarness : undefined
let engine = makeEngine(initialRepo, (await validateProjectDir(initialRepo)).defaultBranch)
let engineUnsub = engine.on(broadcast)

function makeEngine(repoRoot: string, defaultBranch?: string): ThreadEngine {
  const e = new ThreadEngine({
    repoRoot,
    repoUrl: repoRoot,
    defaultBranch,
    harnessId: currentHarness,
    // browser_check loads a thread's preview from this same server.
    previewBaseUrl: `http://127.0.0.1:${PORT}`,
  })
  e.store.updateProjectRunConfig('project', { test: process.env.TEST_CMD ?? 'node --test' })
  return e
}

/** Tear down the current engine and open `dir` as the project. */
async function openProject(dir: string): Promise<{ ok: boolean; error?: string }> {
  const info = await validateProjectDir(dir)
  if (!info.ok) return { ok: false, error: info.error }

  engineUnsub()
  engine.close()

  currentRepo = info.path
  engine = makeEngine(info.path, info.defaultBranch)
  engineUnsub = engine.on(broadcast)
  writeLastProject(info.path)

  broadcast({ type: 'state', snapshot: engine.snapshot() })
  return { ok: true }
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

    // — Server-Sent Events: live engine + thread state + agent activity —
    if (pathname === '/api/events') {
      let send: (e: EngineEvent) => void = () => {}
      const stream = new ReadableStream({
        start(controller) {
          send = (e: EngineEvent) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(e)}\n\n`)
            } catch {
              subscribers.delete(send)
            }
          }
          // Initial state + a thread event per open thread so a (re)connecting
          // client backfills everything it missed.
          send({ type: 'state', snapshot: engine.snapshot() })
          for (const t of engine.listThreads()) {
            send({ type: 'thread', threadId: t.id, thread: t, items: engine.store.listQueueItems(t.id) })
          }
          subscribers.add(send)
        },
        cancel() {
          subscribers.delete(send)
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
    // project root. Falls back to the project root if the thread has no worktree yet.
    const tpMatch = pathname.match(/^\/thread-preview\/([^/]+)(\/.*)?$/)
    if (tpMatch) {
      const [, threadId, sub] = tpMatch
      return servePreview(engine.getThread(threadId)?.worktreePath ?? currentRepo, sub ?? '/')
    }

    // Live preview of the project's own files (web projects).
    if (pathname === '/preview' || pathname.startsWith('/preview/')) {
      return servePreview(currentRepo, pathname === '/preview' ? '/' : pathname.slice('/preview'.length))
    }

    if (pathname === '/api/state') return json(engine.snapshot())

    if (pathname === '/api/fs/list') {
      return json(browseDir(url.searchParams.get('path') ?? undefined))
    }

    if (pathname === '/api/project/open' && req.method === 'POST') {
      const { path } = await body(req)
      if (!path) return json({ error: 'path required' }, 400)
      const result = await openProject(String(path))
      return result.ok ? json({ ok: true, path: currentRepo }) : json(result, 400)
    }

    // Switch the agent harness (app-wide). Applies to the live engine immediately
    // and persists for the next launch / project swap.
    if (pathname === '/api/settings/agent' && req.method === 'POST') {
      const { harnessId } = await body(req)
      if (!isHarnessId(harnessId)) return json({ error: 'invalid harnessId' }, 400)
      currentHarness = harnessId
      engine.setHarness(harnessId)
      writeAgentHarness(harnessId)
      return json({ ok: true, harnessId })
    }

    if (pathname === '/api/run' && req.method === 'POST') {
      const { command } = await body(req)
      if (!command) return json({ error: 'command required' }, 400)
      try {
        return json(await engine.runShell(String(command)))
      } catch (err) {
        return json({ error: (err as Error).message }, 500)
      }
    }

    // — Threads —
    if (pathname === '/api/threads') {
      if (req.method === 'POST') {
        const b = await body(req)
        return json(engine.createThread({ title: b.title }))
      }
      return json(engine.listThreads())
    }

    const threadActionMatch = pathname.match(/^\/api\/thread\/([^/]+)\/(.+)$/)
    if (threadActionMatch && req.method === 'POST') {
      const [, threadId, action] = threadActionMatch
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
          engine.closeThread(threadId)
          return json({ ok: true })
        case 'reopen':
          engine.reopenThread(threadId)
          return json({ ok: true })
        case 'delete':
          void engine.deleteThread(threadId)
          return json({ ok: true })
        case 'auto-queue-suggestions':
          engine.setAutoQueueSuggestions(threadId, !!b.on)
          return json({ ok: true })
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
      const data = engine.threadData(threadMatch[1])
      return data ? json(data) : json({ error: 'not found' }, 404)
    }

    // — Queue item actions —
    const queueMatch = pathname.match(/^\/api\/queue\/([^/]+)\/([^/]+)$/)
    if (queueMatch && req.method === 'POST') {
      const [, itemId, action] = queueMatch
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

    // — Skills & workflows —
    if (pathname === '/api/skills/search') {
      return json({ skills: await engine.searchSkills(url.searchParams.get('q') ?? '') })
    }
    if (pathname === '/api/skills/install' && req.method === 'POST') {
      const b = await body(req)
      const skill = await engine.installSkill(
        String(b.source ?? ''),
        String(b.slug ?? ''),
        b.name ? String(b.name) : undefined,
      )
      return skill
        ? json({ skill, skills: engine.listSkills() })
        : json({ error: 'install failed' }, 400)
    }
    if (pathname === '/api/skills') return json(engine.listSkills())
    const skillMatch = pathname.match(/^\/api\/skill\/([^/]+)$/)
    if (skillMatch && req.method === 'POST') {
      const b = await body(req)
      engine.writeSkill(skillMatch[1], String(b.prompt ?? ''))
      return json({ ok: true })
    }
    if (pathname === '/api/workflows') return json(engine.listWorkflows())
    const workflowMatch = pathname.match(/^\/api\/workflow\/([^/]+)$/)
    if (workflowMatch && req.method === 'POST') {
      const b = await body(req)
      engine.saveWorkflow(workflowMatch[1], Array.isArray(b.skills) ? b.skills.map(String) : [])
      return json({ ok: true })
    }

    // — Governing docs —
    const docMatch = pathname.match(/^\/api\/doc\/([^/]+)$/)
    if (docMatch && req.method === 'POST') {
      const { content } = await body(req)
      try {
        engine.saveDoc(docMatch[1], String(content ?? ''))
        return json({ ok: true })
      } catch (err) {
        return json({ error: (err as Error).message }, 400)
      }
    }
    if (docMatch) {
      return json({
        name: docMatch[1],
        content: engine.docs.read(docMatch[1] as any),
        cap: engine.docs.capFor(docMatch[1] as any),
      })
    }

    // — Built SPA (packaged). In dev, Vite serves the UI instead. —
    if (!pathname.startsWith('/api/')) return serveUi(pathname)

    return new Response('Not found', { status: 404 })
  },
})

console.log(`Freebuff Desktop orchestrator on http://localhost:${server.port}`)
console.log(`Target repo: ${currentRepo}`)
