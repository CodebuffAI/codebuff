import { beforeAll, describe, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import React, { act } from 'react'

import { StatusBar } from '../status-bar'
import { initializeThemeStore } from '../../hooks/use-theme'
import {
  clearActiveRunAborter,
  hasActiveRun,
  setActiveRunAborter,
} from '../../utils/active-run'
import {
  getStatusIndicatorState,
  resolveStreamStatus,
} from '../../utils/status-indicator-state'

beforeAll(() => {
  initializeThemeStore()
})

describe('StatusBar', () => {
  test('renders working after Chat remounts during an active run', async () => {
    setActiveRunAborter('remounted-run', () => {})
    try {
      const statusIndicatorState = getStatusIndicatorState({
        statusMessage: null,
        streamStatus: resolveStreamStatus('idle', true, hasActiveRun()),
        nextCtrlCWillExit: false,
        isConnected: true,
      })
      const setup = await testRender(
        <StatusBar
          timerStartTime={null}
          isAtBottom
          scrollToLatest={() => {}}
          statusIndicatorState={statusIndicatorState}
          freebuffSession={null}
        />,
        { width: 80, height: 3 },
      )

      try {
        await act(async () => {
          await setup.renderOnce()
        })
        expect(setup.captureCharFrame()).toContain('working...')
      } finally {
        act(() => setup.renderer.destroy())
      }
    } finally {
      clearActiveRunAborter('remounted-run')
    }
  })
})
