import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import * as fs from 'fs'

import { detectTerminalTheme } from '../../utils/terminal-color-detection'

// Simple in-memory Readable-like shim
class FakeReadStream {
  private dataHandler: ((chunk: string | Buffer) => void) | null = null
  private errorHandler: ((err: any) => void) | null = null
  on(event: 'data' | 'error', handler: any) {
    if (event === 'data') this.dataHandler = handler
    if (event === 'error') this.errorHandler = handler
  }
  removeListener(event: 'data' | 'error', handler: any) {
    if (event === 'data' && this.dataHandler === handler) this.dataHandler = null
    if (event === 'error' && this.errorHandler === handler) this.errorHandler = null
  }
  close() {}
  emitData(s: string) {
    this.dataHandler?.(s)
  }
  emitError(e: any) {
    this.errorHandler?.(e)
  }
}

describe('detectTerminalTheme (integration)', () => {
  const spies: Array<ReturnType<typeof spyOn>> = []
  let createReadStreamInstance: FakeReadStream | null = null
  let openCount = 0

  beforeEach(() => {
    openCount = 0
    createReadStreamInstance = null
    spies.push(
      spyOn(fs, 'openSync').mockImplementation(() => {
        openCount += 1
        return 100 + openCount
      }),
    )
    spies.push(spyOn(fs, 'closeSync').mockImplementation(() => {}))
    spies.push(spyOn(fs, 'writeSync').mockImplementation(() => 0 as any))
    spies.push(
      spyOn(fs, 'createReadStream').mockImplementation(() => {
        createReadStreamInstance = new FakeReadStream()
        return createReadStreamInstance as any
      }),
    )
  })

  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore()
  })

  it('returns dark for black background via OSC 11', async () => {
    const promise = detectTerminalTheme()
    // Emit a valid OSC 11 response shortly after
    setTimeout(() => {
      createReadStreamInstance?.emitData("\u001b]11;rgb:0000/0000/0000\u0007")
    }, 0)
    await expect(promise).resolves.toBe('dark')
  })

  it('returns light for white background via OSC 11', async () => {
    const promise = detectTerminalTheme()
    setTimeout(() => {
      createReadStreamInstance?.emitData("\u001b]11;rgb:ffff/ffff/ffff\u0007")
    }, 0)
    await expect(promise).resolves.toBe('light')
  })

  it('falls back to OSC 10 when OSC 11 fails', async () => {
    let call = 0
    // For first read stream (OSC 11), emit error; for second (OSC 10), emit data
    ;(fs.createReadStream as any).mockImplementation(() => {
      createReadStreamInstance = new FakeReadStream()
      call += 1
      setTimeout(() => {
        if (call === 1) {
          createReadStreamInstance?.emitError(new Error('no response'))
        } else {
          createReadStreamInstance?.emitData("\u001b]10;rgb:ffff/ffff/ffff\u0007")
        }
      }, 0)
      return createReadStreamInstance as any
    })

    const theme = await detectTerminalTheme()
    expect(theme).toBe('dark') // From foreground fallback (bright text => dark theme)
  })
})
