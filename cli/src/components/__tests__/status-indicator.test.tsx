import { describe, test, expect } from 'bun:test'

import {
  getStatusIndicatorState } from '../../utils/status-indicator-state'

import type {
 StatusIndicatorStateArgs } from '../../utils/status-indicator-state';

describe('StatusIndicator state logic', () => {
  describe('getStatusIndicatorState', () => {
    const baseArgs: StatusIndicatorStateArgs = {
      statusMessage: null,
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
        statusMessage: 'Some message',
        streamStatus: 'streaming',
        isConnected: false,
      })
      expect(state.kind).toBe('ctrlC')
    })

    test('returns clipboard state when message exists (second priority)', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        statusMessage: 'Copied to clipboard!',
        streamStatus: 'streaming',
        isConnected: false,
      })
      expect(state.kind).toBe('clipboard')
      if (state.kind === 'clipboard') {
        expect(state.message).toBe('Copied to clipboard!')
      }
    })

    test('returns retrying state when auth is retrying even if connected and reachable', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        isConnected: true,
        authStatus: 'retrying',
        streamStatus: 'streaming',
      })
      expect(state.kind).toBe('retrying')
    })

    test('returns retrying state when message send is retrying', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        isRetrying: true,
        streamStatus: 'waiting',
      })
      expect(state.kind).toBe('retrying')
    })

    test('returns connecting state when not connected (third priority)', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        isConnected: false,
        streamStatus: 'streaming',
      })
      expect(state.kind).toBe('connecting')
    })

    test('returns connecting state when auth service is unreachable', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        isConnected: true,
        authStatus: 'unreachable',
        streamStatus: 'streaming',
      })
      expect(state.kind).toBe('connecting')
    })

    test('returns connecting state when both WebSocket and auth service are unreachable', () => {
      const state = getStatusIndicatorState({
        ...baseArgs,
        isConnected: false,
        authStatus: 'unreachable',
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
        statusMessage: '',
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
          statusMessage: 'Test',
        })
        expect(state.kind).toBe('ctrlC')
      })

      test('clipboard beats connecting', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          statusMessage: 'Test',
          isConnected: false,
        })
        expect(state.kind).toBe('clipboard')
      })

      test('retrying beats waiting', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          isConnected: true,
          authStatus: 'retrying',
          streamStatus: 'waiting',
        })
        expect(state.kind).toBe('retrying')
      })

      test('connecting beats waiting', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          isConnected: false,
          streamStatus: 'waiting',
        })
        expect(state.kind).toBe('connecting')
      })

      test('auth unreachable beats waiting', () => {
        const state = getStatusIndicatorState({
          ...baseArgs,
          isConnected: true,
          authStatus: 'unreachable',
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
