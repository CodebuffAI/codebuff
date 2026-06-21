/**
 * Freebuff Desktop orchestrator process — HTTP + SSE server (the Bun side of the
 * Electron-shell + Bun-orchestrator split). Serves the self-contained UI and the
 * API the renderer drives. One origin, no build step, so the verification loop is
 * fast.
 *
 *   bun freebuff-desktop/src/app/server.ts
 *   PORT=8787 TARGET_REPO=/path/to/repo bun freebuff-desktop/src/app/server.ts
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { Engine, type EngineEvent } from './engine'
import { ensureSampleRepo } from './sample-repo'

const PORT = Number(process.env.PORT ?? 8787)
const TARGET_REPO =
  process.env.TARGET_REPO ?? join(process.env.HOME ?? '/tmp', 'freebuff-desktop-demo')
const UI_PATH = join(import.meta.dir, 'ui', 'index.html')

await ensureSampleRepo(TARGET_REPO)

const engine = new Engine({
  repoRoot: TARGET_REPO,
  repoUrl: TARGET_REPO,
  concurrencyCap: Number(process.env.CONCURRENCY ?? 2),
  // Scout on by default — proposals are a reviewable backlog (§9), not auto-run,
  // so it's safe. Set ENABLE_SCOUT=0 to disable.
  enableScout: process.env.ENABLE_SCOUT !== '0',
})

// Discovered run-config (§6.4). For the demo repo this is the node test runner;
// a real attach would run the setup agent. Kept simple here.
engine.store.updateProjectRunConfig('project', {
  test: process.env.TEST_CMD ?? 'node --test',
})

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })

async function body(req: Request): Promise<any> {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url)
    const { pathname } = url

    if (pathname === '/' || pathname === '/index.html') {
      return new Response(readFileSync(UI_PATH, 'utf8'), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    // — Server-Sent Events: live engine state + agent activity —
    if (pathname === '/api/events') {
      let unsub: () => void = () => {}
      const stream = new ReadableStream({
        start(controller) {
          const send = (e: EngineEvent) => {
            try {
              controller.enqueue(`data: ${JSON.stringify(e)}\n\n`)
            } catch {
              unsub()
            }
          }
          send({ type: 'state', snapshot: engine.snapshot() })
          unsub = engine.on(send)
        },
        cancel() {
          unsub()
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

    // Serve the project's own files so the UI can iframe a live preview of web
    // projects. Local-only tool; guard against path traversal.
    if (pathname === '/preview' || pathname.startsWith('/preview/')) {
      let rel = pathname === '/preview' ? '/' : pathname.slice('/preview'.length)
      rel = decodeURIComponent(rel.split('?')[0])
      if (rel.includes('..')) return new Response('Forbidden', { status: 403 })
      if (rel.endsWith('/')) rel += 'index.html'
      const full = join(TARGET_REPO, rel)
      if (!existsSync(full)) return new Response('Not found', { status: 404 })
      return new Response(Bun.file(full))
    }

    if (pathname === '/api/state') return json(engine.snapshot())

    if (pathname === '/api/chat-history') return json(engine.chatHistory())

    if (pathname === '/api/chat' && req.method === 'POST') {
      const { message } = await body(req)
      if (!message) return json({ error: 'message required' }, 400)
      // Fire-and-forget: progress streams over SSE.
      void engine.handleChat(String(message)).catch((err) =>
        console.error('chat error', err),
      )
      return json({ ok: true })
    }

    if (pathname === '/api/tick' && req.method === 'POST') {
      void engine.tick()
      return json({ ok: true })
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

    const taskMatch = pathname.match(/^\/api\/task\/([^/]+)\/([^/]+)$/)
    if (taskMatch && req.method === 'POST') {
      const [, taskId, action] = taskMatch
      if (action === 'approve') {
        void engine.approveAndMerge(taskId).catch((e) => console.error(e))
        return json({ ok: true })
      }
      if (action === 'request-changes') {
        const { comments } = await body(req)
        engine.requestChanges(taskId, String(comments ?? ''))
        return json({ ok: true })
      }
      if (action === 'abandon') {
        void engine.abandon(taskId)
        return json({ ok: true })
      }
      if (action === 'accept') {
        engine.acceptTask(taskId)
        return json({ ok: true })
      }
      if (action === 'dismiss') {
        engine.dismissTask(taskId)
        return json({ ok: true })
      }
    }

    const artMatch = pathname.match(/^\/api\/task\/([^/]+)\/artifacts$/)
    if (artMatch) return json(engine.artifacts(artMatch[1]))

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
      const cap = engine.docs.capFor(docMatch[1] as any)
      return json({
        name: docMatch[1],
        content: engine.docs.read(docMatch[1] as any),
        cap,
      })
    }

    return new Response('Not found', { status: 404 })
  },
})

console.log(`Freebuff Desktop orchestrator on http://localhost:${server.port}`)
console.log(`Target repo: ${TARGET_REPO}`)
