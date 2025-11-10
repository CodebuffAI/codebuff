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

  test('shows elapsed seconds when waiting for response', () => {
    const now = Date.now()
    const markup = renderToStaticMarkup(
      <StatusIndicator
        clipboardMessage={null}
        isActive={true}
        isWaitingForResponse={true}
        timerStartTime={now - 5000}
        nextCtrlCWillExit={false}
      />,
    )

    expect(markup).toContain('thinking...')

    const inactiveMarkup = renderToStaticMarkup(
      <StatusIndicator
        clipboardMessage={null}
        isActive={false}
        isWaitingForResponse={false}
        timerStartTime={null}
        nextCtrlCWillExit={false}
      />,
    )

    expect(inactiveMarkup).toBe('')
  })

  test('clipboard message takes priority over timer output', () => {
    const now = Date.now()
    const markup = renderToStaticMarkup(
      <StatusIndicator
        clipboardMessage="Copied!"
        isActive={true}
        isWaitingForResponse={true}
        timerStartTime={now - 12000}
        nextCtrlCWillExit={false}
      />,
    )

    expect(markup).toContain('Copied!')
    expect(markup).not.toContain('12s')
  })
})
