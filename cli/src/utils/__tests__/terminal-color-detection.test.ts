import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  parseOSCResponse,
  buildOscQuery,
  terminalLikelySupportsOSC,
} from '../../utils/terminal-color-detection'

const originalEnv = { ...process.env }

function resetEnv() {
  // Reset only keys we touch to avoid clobbering unrelated runner env
  delete process.env.TERM
  delete process.env.TERM_PROGRAM
  delete process.env.TMUX
  delete process.env.STY
  delete process.env.GHOSTTY_RESOURCES_DIR
}

describe('terminal-color-detection helpers', () => {
  beforeEach(() => {
    resetEnv()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('parses OSC responses with BEL terminator', () => {
    const raw = `\x1b]11;rgb:ff/00/80\x07`
    const rgb = parseOSCResponse(raw)
    expect(rgb).toEqual([255, 0, 128])
  })

  it('parses 16-bit RGB and normalizes to 8-bit', () => {
    const raw = `\x1b]11;rgb:ffff/0000/8080\x07`
    const rgb = parseOSCResponse(raw)
    expect(rgb).toEqual([255, 0, 128])
  })

  it('builds passthrough query for tmux', () => {
    process.env.TMUX = 'tmux-yes'
    const q = buildOscQuery(11)
    // Should include DCS tmux; ESC ] ... BEL ESC \\
    expect(q.startsWith('\x1bPtmux;')).toBe(true)
    expect(q.endsWith('\x1b\\')).toBe(true)
  })

  it('builds passthrough query for screen/byobu', () => {
    process.env.STY = 'screen-yes'
    const q = buildOscQuery(11)
    expect(q.startsWith('\x1bP')).toBe(true)
    expect(q.endsWith('\x1b\\')).toBe(true)
  })

  it('terminalLikelySupportsOSC: TERM_PROGRAM program match', () => {
    process.env.TERM_PROGRAM = 'WezTerm'
    expect(terminalLikelySupportsOSC()).toBe(true)
  })

  it('terminalLikelySupportsOSC: TERM value match', () => {
    process.env.TERM = 'xterm-kitty'
    expect(terminalLikelySupportsOSC()).toBe(true)
  })

  it('terminalLikelySupportsOSC: tmux allowed with passthrough', () => {
    process.env.TMUX = 'tmux-yes'
    expect(terminalLikelySupportsOSC()).toBe(true)
  })

  it('terminalLikelySupportsOSC: ghostty env assumed', () => {
    process.env.GHOSTTY_RESOURCES_DIR = '/tmp/ghostty'
    expect(terminalLikelySupportsOSC()).toBe(true)
  })
})

