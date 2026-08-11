import { describe, test, expect, beforeEach } from 'bun:test'

import {
  detectTerminalImageSupport,
  getKittyFormat,
  renderInlineImage,
  resetTerminalImageSupportCache,
} from '../terminal-images'

/** Detect kitty support and keep it cached so renderInlineImage uses it. */
const useKitty = () => {
  resetTerminalImageSupportCache()
  expect(detectTerminalImageSupport({ TERM: 'xterm-kitty' } as any)).toBe(
    'kitty',
  )
}

/** Detect iTerm2 support and keep it cached so renderInlineImage uses it. */
const useITerm2 = () => {
  resetTerminalImageSupportCache()
  expect(detectTerminalImageSupport({ TERM_PROGRAM: 'iTerm.app' } as any)).toBe(
    'iterm2',
  )
}

describe('detectTerminalImageSupport', () => {
  beforeEach(() => {
    resetTerminalImageSupportCache()
  })

  test('detects iTerm2', () => {
    expect(
      detectTerminalImageSupport({ TERM_PROGRAM: 'iTerm.app' } as any),
    ).toBe('iterm2')
  })

  test('detects kitty by TERM', () => {
    expect(detectTerminalImageSupport({ TERM: 'xterm-kitty' } as any)).toBe(
      'kitty',
    )
  })

  test('detects kitty by KITTY_WINDOW_ID', () => {
    expect(
      detectTerminalImageSupport({ KITTY_WINDOW_ID: '1' } as any),
    ).toBe('kitty')
  })

  test('detects WezTerm', () => {
    expect(
      detectTerminalImageSupport({ TERM_PROGRAM: 'WezTerm' } as any),
    ).toBe('kitty')
  })

  test('detects Ghostty', () => {
    expect(
      detectTerminalImageSupport({ TERM_PROGRAM: 'Ghostty' } as any),
    ).toBe('kitty')
  })

  test('detects Warp', () => {
    expect(
      detectTerminalImageSupport({ TERM_PROGRAM: 'WarpTerminal' } as any),
    ).toBe('kitty')
  })

  test('detects Konsole', () => {
    expect(
      detectTerminalImageSupport({ KONSOLE_VERSION: '230604' } as any),
    ).toBe('kitty')
  })

  test('unknown terminal (e.g. Windows Terminal) falls back to none', () => {
    expect(
      detectTerminalImageSupport({
        TERM: 'xterm-256color',
        TERM_PROGRAM: 'Windows Terminal',
        WT_SESSION: 'abc',
      } as any),
    ).toBe('none')
  })
})

describe('getKittyFormat', () => {
  test('maps PNG to 100', () => {
    expect(getKittyFormat('image/png')).toBe(100)
  })

  test('maps JPEG to 102', () => {
    expect(getKittyFormat('image/jpeg')).toBe(102)
  })

  test('maps WebP to 103', () => {
    expect(getKittyFormat('image/webp')).toBe(103)
  })

  test('maps GIF to 104', () => {
    expect(getKittyFormat('image/gif')).toBe(104)
  })

  test('defaults unknown to PNG', () => {
    expect(getKittyFormat(undefined)).toBe(100)
    expect(getKittyFormat('application/pdf')).toBe(100)
  })
})

describe('generateKittyImageSequence (via renderInlineImage)', () => {
  beforeEach(() => {
    resetTerminalImageSupportCache()
  })

  test('single chunk carries m=0 to close the transmission', () => {
    useKitty()
    const seq = renderInlineImage('aGVsbG8=', {
      width: 4,
      height: 3,
      mediaType: 'image/png',
    })
    expect(seq).toContain('a=T')
    expect(seq).toContain('f=100')
    expect(seq).toContain('t=d')
    expect(seq).toContain('c=4')
    expect(seq).toContain('r=3')
    expect(seq).toContain('m=0')
    expect(seq).toEndWith('aGVsbG8=\x1b\\')
  })

  test('multi-chunk: full control only on first chunk; m=1 middle; m=0 last', () => {
    useKitty()
    // 9000 base64 chars → 3 chunks (4096 + 4096 + 808)
    const seq = renderInlineImage('A'.repeat(9000), {
      width: 10,
      height: 5,
      mediaType: 'image/jpeg',
    })
    expect(seq).toContain('f=102')
    expect(seq).toContain('c=10')

    const parts = seq!.split('\x1b\\').filter(Boolean)
    expect(parts).toHaveLength(3)

    // First chunk: full control data + m=1
    expect(parts[0]).toContain('a=T')
    expect(parts[0]).toContain('f=102')
    expect(parts[0]).toContain('m=1')
    // Middle chunk: m only — no a=, no f=, no c=, no r=
    expect(parts[1]).toMatch(/^\x1b_Gm=1;A{4096}$/)
    // Last chunk: m=0
    expect(parts[2]).toMatch(/^\x1b_Gm=0;A{808}$/)
  })

  test('subsequent chunks never repeat a=T / f= / c= (kitty spec)', () => {
    useKitty()
    // 9000 chars → 3 chunks, so index 1 is a true middle chunk.
    const seq = renderInlineImage('B'.repeat(9000), {
      mediaType: 'image/png',
    })
    const middle = seq!.split('\x1b\\')[1]
    expect(middle).not.toContain('a=T')
    expect(middle).not.toContain('f=')
    expect(middle).not.toContain('c=')
    expect(middle).toMatch(/^\x1b_Gm=1;/)
  })
})

describe('generateITerm2ImageSequence (via renderInlineImage)', () => {
  beforeEach(() => {
    resetTerminalImageSupportCache()
  })

  test('size param is the decoded byte length, not the base64 length', () => {
    useITerm2()
    const seq = renderInlineImage('aGVsbG8=', { filename: 'x.png' })
    // 'hello' → 5 decoded bytes; base64 'aGVsbG8=' → 8 chars
    expect(seq).toContain('size=5')
    expect(seq).not.toContain('size=8')
    expect(seq).toContain('inline=1')
    expect(seq).toContain('name=eC5wbmc=')
  })

  test('returns null when the terminal does not support inline images', () => {
    // Prime the cache with an explicit 'none' so the assertion doesn't depend
    // on whatever terminal this test happens to run inside.
    resetTerminalImageSupportCache()
    expect(
      detectTerminalImageSupport({ TERM: 'xterm-256color' } as any),
    ).toBe('none')
    const seq = renderInlineImage('aGVsbG8=', {})
    expect(seq).toBeNull()
  })
})
