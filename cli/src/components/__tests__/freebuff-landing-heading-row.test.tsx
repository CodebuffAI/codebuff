import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { LandingHeadingRow } from '../freebuff-landing-screen'
import { initializeThemeStore } from '../../hooks/use-theme'
import { getFreebuffStreakLine } from '../../utils/freebuff-streak-line'

let cleanupRenderer: (() => void) | undefined

beforeAll(() => {
  initializeThemeStore()
})

afterEach(() => {
  cleanupRenderer?.()
  cleanupRenderer = undefined
})

/**
 * Mirrors the landing screen's containers around the heading row: a
 * shrink-to-fit column inside a centered, maxWidth-capped column. That shape
 * is what broke the row — with nothing wider on screen the column collapses
 * to the row's own width, leaving space-between no space to hand out.
 */
const mountHeadingRow = async (streak: number, contentMaxWidth: number) => {
  const setup = await createTestRenderer({ width: contentMaxWidth + 4, height: 6 })
  const root = createRoot(setup.renderer)
  cleanupRenderer = () => {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }
  flushSync(() =>
    root.render(
      <box style={{ flexDirection: 'column', alignItems: 'center', maxWidth: contentMaxWidth }}>
        <box style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
          <LandingHeadingRow
            streakLine={getFreebuffStreakLine(streak)}
            marginBottom={1}
          />
        </box>
      </box>,
    ),
  )
  await setup.renderOnce()
  return setup
}

const renderHeadingRow = async (streak: number, contentMaxWidth: number) =>
  (await mountHeadingRow(streak, contentMaxWidth)).captureCharFrame()

describe('LandingHeadingRow', () => {
  test('keeps the streak clear of the heading when nothing wider is on screen', async () => {
    const frame = await renderHeadingRow(18, 60)
    const line = frame
      .split('\n')
      .find((row) => row.includes('Start coding for free'))!

    // The bug: "Start coding for free18 day streak".
    expect(line).not.toContain('free18')
    expect(line).toMatch(/Start coding for free {3,}18 day streak/)
  })

  test('draws the progress dots as filled/hollow circles', async () => {
    const frame = await renderHeadingRow(18, 60)

    expect(frame).toContain('●●●●●●●+')
  })

  test('leaves the row bare for a user with no streak yet', async () => {
    const frame = await renderHeadingRow(0, 60)

    expect(frame).toContain('Start coding for free')
    expect(frame).not.toContain('day streak')
  })

  // The landing screen only hands over a streak that fits, but a resize lays
  // the current tree out against the new width before React re-renders, so the
  // row does get measured too narrow for a frame. As a space-between flex row
  // that overflow segfaulted the native renderer — it has to survive as text.
  test('survives being laid out narrower than its content', async () => {
    const setup = await mountHeadingRow(18, 60)

    for (const width of [34, 20, 12]) {
      setup.resize(width, 6)
      await setup.renderOnce()
      expect(setup.captureCharFrame()).toContain('Start')
    }
  })
})
