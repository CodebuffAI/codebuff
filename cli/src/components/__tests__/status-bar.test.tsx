import { beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { StatusBar } from '../status-bar'
import { initializeThemeStore } from '../../hooks/use-theme'
import { getStatusIndicatorState } from '../../utils/status-indicator-state'

beforeAll(() => {
  initializeThemeStore()
})

describe('StatusBar', () => {
  test('renders working for the streaming phase', async () => {
    const statusIndicatorState = getStatusIndicatorState({
      statusMessage: null,
      streamStatus: 'streaming',
      nextCtrlCWillExit: false,
      isConnected: true,
    })
    const setup = await createTestRenderer({ width: 80, height: 3 })
    const root = createRoot(setup.renderer)
    flushSync(() => {
      root.render(
        <StatusBar
          timerStartTime={null}
          isAtBottom
          scrollToLatest={() => {}}
          statusIndicatorState={statusIndicatorState}
          freebuffSession={null}
        />,
      )
    })

    try {
      await setup.renderOnce()
      expect(setup.captureCharFrame()).toContain('working...')
    } finally {
      flushSync(() => root.unmount())
      setup.renderer.destroy()
    }
  })
})
