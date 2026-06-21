/**
 * Browser tester (M1, §7.1) — the "actually go and do it" web surface.
 *
 * Serves a project directory, loads it in a real headless browser (system Chrome
 * via Playwright), and reports whether it actually works: console/page errors, and
 * whether anything genuinely rendered (the blank-screen class of bug — e.g. a
 * temporal-dead-zone error that kills the script before the game loop starts —
 * shows up here as a page error + an empty render, which the M0 "run a command"
 * test could never catch). Captures a screenshot as PR evidence (§7.1: approve on
 * proof, not vibes).
 */

import { existsSync } from 'fs'
import { join } from 'path'

import { chromium, type Browser } from 'playwright'

export interface BrowserTestResult {
  /** The page loaded without a navigation/launch failure. */
  loaded: boolean
  consoleErrors: string[]
  pageErrors: string[]
  /** Heuristic: did anything real paint? (canvas pixels, visible text, or DOM). */
  rendered: boolean
  renderDetail: string
  title: string
  /** Base64 PNG screenshot (capped); undefined if capture failed. */
  screenshot?: string
  /** Set if the test harness itself failed (couldn't serve or launch a browser). */
  harnessError?: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

/** Serve `dir` statically on an ephemeral port; returns the server + base URL. */
function serveDir(dir: string) {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      let rel = decodeURIComponent(new URL(req.url).pathname)
      if (rel.includes('..')) return new Response('forbidden', { status: 403 })
      if (rel === '/' || rel === '') rel = '/index.html'
      const full = join(dir, rel)
      if (!existsSync(full)) return new Response('not found', { status: 404 })
      const ext = rel.slice(rel.lastIndexOf('.'))
      return new Response(Bun.file(full), {
        headers: CONTENT_TYPES[ext] ? { 'content-type': CONTENT_TYPES[ext] } : {},
      })
    },
  })
  return { server, url: `http://localhost:${server.port}` }
}

async function launchBrowser(): Promise<Browser> {
  // The bundled browser version can mismatch the install; system Chrome is stable.
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' })
  } catch {
    return await chromium.launch({ headless: true })
  }
}

/** The render heuristic, evaluated inside the page. */
const RENDER_PROBE = `(() => {
  let painted = 0
  for (const c of document.querySelectorAll('canvas')) {
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++
    } catch (e) {}
  }
  const text = (document.body && document.body.innerText || '').trim().length
  const els = document.body ? document.body.querySelectorAll('*').length : 0
  return { painted, text, els, title: document.title }
})()`

export async function runBrowserTest(
  dir: string,
  opts: { path?: string; waitMs?: number } = {},
): Promise<BrowserTestResult> {
  if (!existsSync(join(dir, opts.path ?? 'index.html'))) {
    return {
      loaded: false,
      consoleErrors: [],
      pageErrors: [],
      rendered: false,
      renderDetail: 'no index.html to load',
      title: '',
      harnessError: 'no index.html',
    }
  }

  let serving: ReturnType<typeof serveDir> | undefined
  let browser: Browser | undefined
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  try {
    serving = serveDir(dir)
    browser = await launchBrowser()
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.on('console', (m) => {
      // Ignore resource-load noise (e.g. a missing favicon) — that's not an app bug.
      if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) {
        consoleErrors.push(m.text().slice(0, 500))
      }
    })
    page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 500)))

    let loaded = true
    try {
      await page.goto(`${serving.url}/${opts.path ?? 'index.html'}`, {
        waitUntil: 'load',
        timeout: 15_000,
      })
    } catch (e) {
      loaded = false
      pageErrors.push('navigation: ' + (e as Error).message.slice(0, 300))
    }
    await page.waitForTimeout(opts.waitMs ?? 600)

    const probe = (await page.evaluate(RENDER_PROBE).catch(() => null)) as {
      painted: number
      text: number
      els: number
      title: string
    } | null

    let screenshot: string | undefined
    try {
      const buf = await page.screenshot({ type: 'png' })
      screenshot = buf.toString('base64')
      if (screenshot.length > 400_000) screenshot = undefined // keep artifacts small
    } catch {}

    const rendered = !!probe && (probe.painted > 0 || probe.text > 0 || probe.els > 3)
    const renderDetail = probe
      ? `painted=${probe.painted}px, visibleText=${probe.text}chars, elements=${probe.els}`
      : 'render probe failed'

    return {
      loaded,
      consoleErrors,
      pageErrors,
      rendered,
      renderDetail,
      title: probe?.title ?? '',
      screenshot,
    }
  } catch (e) {
    return {
      loaded: false,
      consoleErrors,
      pageErrors,
      rendered: false,
      renderDetail: '',
      title: '',
      harnessError: (e as Error).message.slice(0, 300),
    }
  } finally {
    await browser?.close().catch(() => {})
    serving?.server.stop(true)
  }
}
