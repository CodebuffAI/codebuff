import React from 'react'

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import { StatusIndicator } from '../status-indicator'
import { chatThemes } from '../../utils/theme-system'
import { renderToStaticMarkup } from 'react-dom/server'
import * as codebuffClient from '../../utils/codebuff-client'

const theme = chatThemes.dark

const createTimer = (elapsedSeconds: number, started: boolean) => ({
  start: () => {},
  stop: () => {},
  elapsedSeconds,
  startTime: started ? Date.now() - elapsedSeconds * 1000 : null,
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
        theme={theme}
        clipboardMessage={null}
        isActive={true}
        timer={createTimer(5, true)}
      />,
    )

    expect(markup).toContain('5s')

    const inactiveMarkup = renderToStaticMarkup(
      <StatusIndicator
        theme={theme}
        clipboardMessage={null}
        isActive={false}
        timer={createTimer(0, false)}
      />,
    )

    expect(inactiveMarkup).toBe('')
  })

  test('clipboard message takes priority over timer output', () => {
    const markup = renderToStaticMarkup(
      <StatusIndicator
        theme={theme}
        clipboardMessage="Copied!"
        isActive={true}
        timer={createTimer(12, true)}
      />,
    )

    expect(markup).toContain('Copied!')
    expect(markup).not.toContain('12s')
  })
})
