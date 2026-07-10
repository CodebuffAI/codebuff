import { describe, test, expect } from 'bun:test'

import { parseFocusState } from '../use-terminal-focus'

const FOCUS_IN = '\x1b[I'
const FOCUS_OUT = '\x1b[O'

describe('parseFocusState', () => {
  test('detects a focus-in event', () => {
    expect(parseFocusState(FOCUS_IN)).toBe(true)
  })

  test('detects a focus-out event', () => {
    expect(parseFocusState(FOCUS_OUT)).toBe(false)
  })

  test('returns null for ordinary typed characters', () => {
    expect(parseFocusState('hello world')).toBeNull()
  })

  test('returns null for an empty chunk', () => {
    expect(parseFocusState('')).toBeNull()
  })

  test('does not misfire on SS3 sequences (application-mode arrow keys)', () => {
    // Arrow keys in application cursor mode are ESC O <letter> (no bracket):
    // ESC O A/B/C/D. These must NOT be read as a bracketed focus event.
    expect(parseFocusState('\x1bOA')).toBeNull()
    expect(parseFocusState('\x1bOB')).toBeNull()
    expect(parseFocusState('\x1bOC')).toBeNull()
    expect(parseFocusState('\x1bOD')).toBeNull()
    // F1 in application mode is ESC O P — also not a focus event.
    expect(parseFocusState('\x1bOP')).toBeNull()
  })

  test('does not misfire on other CSI sequences', () => {
    // Shift-Tab (CSI Z), Home (CSI H), bracketed paste markers.
    expect(parseFocusState('\x1b[Z')).toBeNull()
    expect(parseFocusState('\x1b[H')).toBeNull()
    expect(parseFocusState('\x1b[200~pasted\x1b[201~')).toBeNull()
  })

  test('last event wins when a chunk batches focus out then in', () => {
    // An alt-tab round trip delivered in one chunk nets to focused, so the UI
    // is never left wrongly dimmed.
    expect(parseFocusState(FOCUS_OUT + FOCUS_IN)).toBe(true)
  })

  test('last event wins when a chunk batches focus in then out', () => {
    expect(parseFocusState(FOCUS_IN + FOCUS_OUT)).toBe(false)
  })

  test('detects a focus event interleaved with typed input', () => {
    expect(parseFocusState('abc' + FOCUS_OUT + 'def')).toBe(false)
    expect(parseFocusState('abc' + FOCUS_IN)).toBe(true)
  })

  test('is repeatable across calls (no leaked regex lastIndex state)', () => {
    // FOCUS_EVENT_RE is a module-level /g regex; parseFocusState must reset
    // lastIndex each call or a second call could miss/skip a match.
    expect(parseFocusState(FOCUS_IN)).toBe(true)
    expect(parseFocusState(FOCUS_IN)).toBe(true)
    expect(parseFocusState(FOCUS_OUT)).toBe(false)
    expect(parseFocusState(FOCUS_OUT)).toBe(false)
  })
})
