import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { runInTmux } from './tmux'

describe('runInTmux', () => {
  test('runs commands in a session and captures pane output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fbd-tmux-'))
    writeFileSync(join(dir, 'hi.txt'), 'hello-from-file')
    const r = await runInTmux(dir, ['echo MARKER_123', 'cat hi.txt'], { settleMs: 500 })
    if (r.error === 'tmux not available') return // tmux not installed in this env
    expect(r.error).toBeUndefined()
    expect(r.output).toContain('MARKER_123')
    expect(r.output).toContain('hello-from-file')
  }, 30_000)
})
