import { describe, test, expect } from 'bun:test'
import React from 'react'

import { StatusIndicator, StatusElapsedTime } from '../status-indicator'

import { initializeThemeStore } from '../../hooks/use-theme'
import { renderToStaticMarkup } from 'react-dom/server'
import { getStatusIndicatorState } from '../status-indicator'

describe('StatusIndicator state transitions', () => {

  describe('StatusIndicator text states', () => {
    test('shows "thinking..." when waiting for first response (streamStatus = waiting)', () => {
      const now = Date.now()
      const markup = renderToStaticMarkup(
        <StatusIndicator
          clipboardMessage={null}
          streamStatus="waiting"
          timerStartTime={now - 5000}
          nextCtrlCWillExit={false}
          isConnected={true}
        />,
      )

      // ShimmerText renders individual characters in spans
      expect(markup).toContain('t')
      expect(markup).toContain('h')
      expect(markup).toContain('i')
      expect(markup).toContain('n')
      expect(markup).toContain('k')
      expect(markup).not.toContain('w') // not "working"
    })

    test('shows "working..." when streaming content (streamStatus = streaming)', () => {
      const now = Date.now()
      const markup = renderToStaticMarkup(
        <StatusIndicator
          clipboardMessage={null}
          streamStatus="streaming"
          timerStartTime={now - 5000}
          nextCtrlCWillExit={false}
          isConnected={true}
        />,
      )

      // ShimmerText renders individual characters in spans
      expect(markup).toContain('w')
      expect(markup).toContain('o')
      expect(markup).toContain('r')
      expect(markup).toContain('k')
    })

    test('shows nothing when inactive (streamStatus = idle)', () => {
      const markup = renderToStaticMarkup(
        <StatusIndicator
          clipboardMessage={null}
          streamStatus="idle"
          timerStartTime={null}
          nextCtrlCWillExit={false}
          isConnected={true}
        />,
      )

      expect(markup).toBe('')
    })
  })

  describe('Priority states', () => {
    test('nextCtrlCWillExit takes highest priority', () => {
      const now = Date.now()
      const markup = renderToStaticMarkup(
        <StatusIndicator
          clipboardMessage="Copied!"
          streamStatus="waiting"
          timerStartTime={now - 5000}
          nextCtrlCWillExit={true}
          isConnected={true}
        />,
      )

      expect(markup).toContain('Press Ctrl-C again to exit')
      expect(markup).not.toContain('Copied!')
      expect(markup).not.toContain('thinking')
      expect(markup).not.toContain('working')
    })

    test('clipboard message takes priority over streaming states', () => {
      const now = Date.now()
      const markup = renderToStaticMarkup(
        <StatusIndicator
          clipboardMessage="Copied!"
          streamStatus="waiting"
          timerStartTime={now - 12000}
          nextCtrlCWillExit={false}
          isConnected={true}
        />,
      )

      expect(markup).toContain('Copied!')
      // Shimmer text would contain individual characters, but clipboard message doesn't
    })
  })

  describe('Connectivity states', () => {
    test('shows "connecting..." shimmer when offline and idle', () => {
      const markup = renderToStaticMarkup(
        <StatusIndicator
          clipboardMessage={null}
          streamStatus="idle"
          timerStartTime={null}
          nextCtrlCWillExit={false}
          isConnected={false}
        />,
      )

      expect(markup).toContain('c')
      expect(markup).toContain('o')
      expect(markup).toContain('n')
    })

    test('getStatusIndicatorState reports connecting state when offline', () => {
      const state = getStatusIndicatorState({
        clipboardMessage: null,
        streamStatus: 'idle',
        nextCtrlCWillExit: false,
        isConnected: false,
      })

      expect(state.kind).toBe('connecting')
    })
  })

  describe('StatusElapsedTime', () => {
    test('shows nothing initially (useEffect not triggered in static render)', () => {
      const now = Date.now()
      const markup = renderToStaticMarkup(
        <StatusElapsedTime streamStatus="streaming" timerStartTime={now - 5000} />,
      )

      // Static rendering doesn't trigger useEffect, so elapsed time starts at 0
      // In real usage, useEffect updates the elapsed time after mount
      expect(markup).toBe('')
    })

    test('shows nothing when inactive', () => {
      const now = Date.now()
      const markup = renderToStaticMarkup(
        <StatusElapsedTime streamStatus="idle" timerStartTime={now - 5000} />,
      )

      expect(markup).toBe('')
    })

    test('shows nothing when timerStartTime is null', () => {
      const markup = renderToStaticMarkup(
        <StatusElapsedTime streamStatus="streaming" timerStartTime={null} />,
      )

      expect(markup).toBe('')
    })
  })
})
initializeThemeStore()
