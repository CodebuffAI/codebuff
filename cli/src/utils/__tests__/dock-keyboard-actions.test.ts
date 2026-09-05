import { describe, expect, test } from 'bun:test'

import {
  createDefaultChatKeyboardState,
  resolveChatKeyboardAction,
  type ChatKeyboardState,
} from '../keyboard-actions'

import type { KeyEvent } from '@opentui/core'

const createKey = (overrides: Partial<KeyEvent> = {}): KeyEvent =>
  ({
    name: '',
    sequence: '',
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    ...overrides,
  }) as KeyEvent

const escapeKey = createKey({ name: 'escape' })
const ctrlO = createKey({ name: 'o', ctrl: true })
const base = createDefaultChatKeyboardState()

const control: ChatKeyboardState = {
  ...base,
  dockExpandable: false,
  dockPanelOpen: false,
}
const expandableClosed: ChatKeyboardState = {
  ...base,
  dockExpandable: true,
  dockPanelOpen: false,
}
const expandableOpen: ChatKeyboardState = {
  ...base,
  dockExpandable: true,
  dockPanelOpen: true,
}

describe('sponsor dock keyboard routing (COD-457)', () => {
  test('the control arm resolves the chord to nothing at all', () => {
    // The control arm must behave byte-identically to the pre-COD-457 CLI.
    expect(resolveChatKeyboardAction(ctrlO, control)).toEqual({ type: 'none' })
  })

  test('the chord toggles the panel in the expandable arm, open or closed', () => {
    expect(resolveChatKeyboardAction(ctrlO, expandableClosed)).toEqual({
      type: 'toggle-dock-panel',
    })
    expect(resolveChatKeyboardAction(ctrlO, expandableOpen)).toEqual({
      type: 'toggle-dock-panel',
    })
  })

  test('escape closes the panel only while it is open', () => {
    expect(resolveChatKeyboardAction(escapeKey, expandableOpen)).toEqual({
      type: 'close-dock-panel',
    })
    // Closed: falls through to whatever escape meant before. With a default
    // state and nothing streaming, that is nothing.
    expect(resolveChatKeyboardAction(escapeKey, expandableClosed)).toEqual({
      type: 'none',
    })
  })

  test('escape still interrupts a stream when the panel is closed', () => {
    const streaming = { ...expandableClosed, isStreaming: true }
    expect(resolveChatKeyboardAction(escapeKey, streaming)).toEqual({
      type: 'interrupt-stream',
    })
  })

  test('escape closes the panel INSTEAD of interrupting a stream', () => {
    // Deliberate: at an open panel, escape means "close this". The user can
    // press it again to interrupt, which is one keystroke rather than a lost
    // panel and a killed run on the same press.
    const streaming = { ...expandableOpen, isStreaming: true }
    expect(resolveChatKeyboardAction(escapeKey, streaming)).toEqual({
      type: 'close-dock-panel',
    })
  })

  test('escape still exits a non-default input mode when the panel is closed', () => {
    const bash = { ...expandableClosed, inputMode: 'bash' as const }
    expect(resolveChatKeyboardAction(escapeKey, bash)).toEqual({
      type: 'exit-input-mode',
    })
  })

  test('the out-of-credits and feedback takeovers still win outright', () => {
    const outOfCredits = {
      ...expandableOpen,
      inputMode: 'outOfCredits' as const,
    }
    expect(resolveChatKeyboardAction(escapeKey, outOfCredits)).toEqual({
      type: 'exit-input-mode',
    })

    const feedback = { ...expandableOpen, feedbackMode: true }
    expect(resolveChatKeyboardAction(escapeKey, feedback)).toEqual({
      type: 'exit-feedback-mode',
    })
  })

  test('a modified Ctrl+O is not the chord', () => {
    for (const modifier of ['meta', 'option', 'shift'] as const) {
      const key = createKey({ name: 'o', ctrl: true, [modifier]: true })
      expect(resolveChatKeyboardAction(key, expandableClosed)).toEqual({
        type: 'none',
      })
    }
  })

  test('a bare o is never the chord', () => {
    expect(
      resolveChatKeyboardAction(createKey({ name: 'o' }), expandableClosed),
    ).toEqual({ type: 'none' })
  })

  test('the dock claims no other key in either arm', () => {
    // Everything the dock could plausibly have swallowed still resolves to the
    // action it always did, with the panel wide open.
    const streaming = { ...expandableOpen, isStreaming: true }
    expect(
      resolveChatKeyboardAction(createKey({ name: 'c', ctrl: true }), streaming),
    ).toEqual({ type: 'interrupt-stream' })
    expect(
      resolveChatKeyboardAction(createKey({ name: 'pageup' }), expandableOpen),
    ).toEqual({ type: 'scroll-up' })
    expect(
      resolveChatKeyboardAction(createKey({ name: 't', ctrl: true }), expandableOpen),
    ).toEqual({ type: 'toggle-all' })
  })

  test('the dock defaults are the control arm', () => {
    expect(base.dockExpandable).toBe(false)
    expect(base.dockPanelOpen).toBe(false)
  })
})
