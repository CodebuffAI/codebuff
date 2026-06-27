/**
 * Browser-in-the-loop verification. Loads a URL in a REAL headless browser and
 * reports whether it rendered without console/page errors — the facts an agent
 * cannot get by reading code. Used by the `browser_check` tool so the test/review
 * skills can catch behavioral/visual bugs in web/UI/game work.
 *
 * Uses the user's system Chrome (channel: 'chrome') so no browser binaries ship,
 * falling back to a bundled Chromium if available. When no browser can launch
 * (e.g. CI without a browser), returns `harnessError` instead of throwing, so the
 * agent learns it couldn't verify rather than the turn failing.
 */

export interface BrowserCheckResult {
  /** The page navigated (HTTP load) without a navigation error. */
  loaded: boolean
  /** Something meaningful is on screen (canvas, text, or non-trivial DOM). */
  rendered: boolean
  title: string
  renderDetail: string
  consoleErrors: string[]
  pageErrors: string[]
  /** Set when no browser could run; the result is otherwise empty. */
  harnessError?: string
}

function harness(msg: string): BrowserCheckResult {
  return {
    loaded: false,
    rendered: false,
    title: '',
    renderDetail: '',
    consoleErrors: [],
    pageErrors: [],
    harnessError: msg,
  }
}

export async function runBrowserCheck(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<BrowserCheckResult> {
  let chromium: typeof import('playwright').chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    return harness('playwright is not installed')
  }

  let browser: import('playwright').Browser
  try {
    browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
  } catch (err) {
    return harness(`could not launch a browser: ${(err as Error).message}`)
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    // The browser auto-requests /favicon.ico; without this it 404s and shows up as a
    // spurious console error on otherwise-clean pages. Stub it so it never fires.
    await page.route('**/favicon.ico', (r) => r.fulfill({ status: 200, body: '' }))
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    let loaded = true
    try {
      await page.goto(url, { waitUntil: 'load', timeout: opts.timeoutMs ?? 15_000 })
    } catch (err) {
      loaded = false
      pageErrors.push(`navigation failed: ${(err as Error).message}`)
    }
    // Let scripts run / the first frame paint.
    await page.waitForTimeout(800)

    const title = await page.title().catch(() => '')
    const probe = await page
      .evaluate(() => {
        const body = document.body
        const text = (body?.innerText || '').trim()
        return {
          text: text.slice(0, 160),
          hasCanvas: !!document.querySelector('canvas'),
          elements: body ? body.querySelectorAll('*').length : 0,
        }
      })
      .catch(() => ({ text: '', hasCanvas: false, elements: 0 }))

    const rendered = loaded && (probe.hasCanvas || probe.text.length > 0 || probe.elements > 3)
    const renderDetail = probe.hasCanvas
      ? 'canvas present'
      : probe.text
        ? `text: "${probe.text}"`
        : `${probe.elements} DOM elements`

    return { loaded, rendered, title, renderDetail, consoleErrors, pageErrors }
  } finally {
    await browser.close().catch(() => {})
  }
}
