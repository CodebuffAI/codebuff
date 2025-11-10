import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'
import React from 'react'

import { StatusIndicator } from '../status-indicator'

import '../../state/theme-store' // Initialize theme store
import { renderToStaticMarkup } from 'react-dom/server'

import * as codebuffClient from '../../utils/codebuff-client'
import type { ElapsedTimeTracker } from '../../hooks/use-elapsed-time'

const createMockTimer = (
  elapsedSeconds: number,
  started: boolean,
): ElapsedTimeTracker => ({
  startTime: started ? Date.now() - elapsedSeconds * 1000 : null,
  elapsedSeconds,
  start: () => {},
  stop: () => {},
})

describe('StatusIndicator timer rendering', () => {
  let getClientSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    getClientSpy = spyOn(codebuffClient, 'getCodebuffClient').mockReturnValue({
      checkConnection: mock(async () => true),
    } as any)
  })

  afterEach(() => {
    getClientSpy.mockRestore()
  })

  test('shows elapsed seconds when timer is active', () => {
    const markup = renderToStaticMarkup(
      <StatusIndicator
        clipboardMessage={null}
        isActive={true}
        timer={createMockTimer(5, true)}
        nextCtrlCWillExit={false}
      />,
    )

    expect(markup).toContain('5s')

    const inactiveMarkup = renderToStaticMarkup(
      <StatusIndicator
        clipboardMessage={null}
        isActive={false}
        timer={createMockTimer(0, false)}
        nextCtrlCWillExit={false}
      />,
    )

    expect(inactiveMarkup).toBe('')
  })

  test('clipboard message takes priority over timer output', () => {
    const markup = renderToStaticMarkup(
      <StatusIndicator
        clipboardMessage="Copied!"
        isActive={true}
        timer={createMockTimer(12, true)}
        nextCtrlCWillExit={false}
      />,
    )

    expect(markup).toContain('Copied!')
    expect(markup).not.toContain('12s')
  })
})
