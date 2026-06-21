import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { runBrowserTest } from './browser'

function tmpHtml(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fbd-bt-'))
  writeFileSync(join(dir, 'index.html'), html)
  return dir
}

describe('runBrowserTest (real headless browser)', () => {
  test('catches a blank-screen page error (the bug M0 testing missed)', async () => {
    // Temporal-dead-zone: draw() runs before COLORS is initialized → script throws,
    // nothing renders. A "run a command" test can't see this; a browser can.
    const dir = tmpHtml(
      '<!doctype html><html><body><canvas id=c></canvas><script>' +
        'function draw(){document.getElementById("c").getContext("2d").fillStyle=COLORS[0]}' +
        'draw(); const COLORS=["#f00"];</script></body></html>',
    )
    const r = await runBrowserTest(dir)
    if (r.harnessError) return // no browser available in this environment
    expect(r.rendered).toBe(false)
    expect(r.pageErrors.join(' ')).toContain('before initialization')
    expect(r.screenshot).toBeTruthy()
  }, 60_000)

  test('passes a page that renders cleanly', async () => {
    const dir = tmpHtml(
      '<!doctype html><html><body><h1>Hello</h1><canvas id=c width=80 height=80></canvas>' +
        '<script>const ctx=document.getElementById("c").getContext("2d");ctx.fillStyle="#0f0";ctx.fillRect(0,0,80,80)</script></body></html>',
    )
    const r = await runBrowserTest(dir)
    if (r.harnessError) return
    expect(r.loaded).toBe(true)
    expect(r.rendered).toBe(true)
    expect(r.pageErrors).toEqual([])
    expect(r.consoleErrors).toEqual([])
  }, 60_000)

  test('reports a harness signal when there is no index.html', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fbd-bt-empty-'))
    const r = await runBrowserTest(dir)
    expect(r.harnessError).toBe('no index.html')
  })
})
