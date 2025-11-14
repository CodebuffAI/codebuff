import { describe, test, expect } from 'bun:test'

import { getStatusIndicatorState } from '../../utils/status-indicator-state'
import type { StatusIndicatorStateArgs } from '../../utils/status-indicator-state'

describe('StatusIndicator state logic', () => {
  describe('getStatusIndicatorState', () => {
    const baseArgs: StatusIndicatorStateArgs = {
      clipboardMessage: null,
      streamStatus: 'idle',
      nextCtrlCWillExit: false,
      isConnected: true,
    }

    test('returns idle state when no special conditions', () => {
      const state = getStatusIndicatorState(baseArgs)
      expect(state.kind).toBe('idle')
    })

    test('returns ctrlC state when nextCtrlCWillExit is true (highest priority)', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        nextCtrlCWillExit: true,
        clipboardMessage: 'Some message',
        streamStatus: 'streaming',
        isConnected: false,
      })
      expect(state.kind).toBe('ctrlC')
    })

    test('returns clipboard state when message exists (second priority)', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        clipboardMessage: 'Copied to clipboard!',
        streamStatus: 'streaming',
        isConnected: false,
      })
      expect(state.kind).toBe('clipboard')
      if (state.kind === 'clipboard') {
        expect(state.message).toBe('Copied to clipboard!')
      }
    })

    test('returns connecting state when not connected (third priority)', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        isConnected: false,
        streamStatus: 'streaming',
      })
      expect(state.kind).toBe('connecting')
    })

    test('returns waiting state when streamStatus is waiting', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        streamStatus: 'waiting',
      })
      expect(state.kind).toBe('waiting')
    })

    test('returns streaming state when streamStatus is streaming', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        streamStatus: 'streaming',
      })
      expect(state.kind).toBe('streaming')
    })

    test('handles empty clipboard message as falsy', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        clipboardMessage: '',
        streamStatus: 'streaming',
      })
      // Empty string is falsy, should fall through to streaming state
      expect(state.kind).toBe('streaming')
    })

    describe('state priority order', () => {
      test('nextCtrlCWillExit beats clipboard', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          nextCtrlCWillExit: true,
          clipboardMessage: 'Test',
        })
        expect(state.kind).toBe('ctrlC')
      })

      test('clipboard beats connecting', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          clipboardMessage: 'Test',
          isConnected: false,
        })
        expect(state.kind).toBe('clipboard')
      })

      test('connecting beats waiting', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          isConnected: false,
          streamStatus: 'waiting',
        })
        expect(state.kind).toBe('connecting')
      })

      test('waiting beats streaming', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          streamStatus: 'waiting',
        })
        expect(state.kind).toBe('waiting')
      })

      test('streaming beats idle', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          streamStatus: 'streaming',
        })
        expect(state.kind).toBe('streaming')
      })
    })
  })
})
