import { beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { TerminalCommandDisplay } from '../terminal-command-display'
import { initializeThemeStore } from '../../hooks/use-theme'

beforeAll(() => {
  initializeThemeStore()
})

describe('TerminalCommandDisplay', () => {
  test('renders short output without truncation or show more button', async () => {
    const setup = await createTestRenderer({ width: 80, height: 10 })
    const root = createRoot(setup.renderer)

    flushSync(() => {
      root.render(
        <TerminalCommandDisplay
          command="ls"
          output="file1.txt\nfile2.txt"
          expandable={true}
          maxVisibleLines={5}
        />,
      )
    })

    try {
      await setup.renderOnce()
      const frame = setup.captureCharFrame()
      expect(frame).toContain('$ ls')
      expect(frame).toContain('file1.txt')
      expect(frame).toContain('file2.txt')
      expect(frame).not.toContain('Show')
    } finally {
      flushSync(() => root.unmount())
      setup.renderer.destroy()
    }
  })

  test('truncates output exceeding maxVisibleLines and displays show more button', async () => {
    const setup = await createTestRenderer({ width: 80, height: 15 })
    const root = createRoot(setup.renderer)

    const manyLines = Array.from({ length: 20 }, (_, i) => `log line ${i + 1}`).join('\n')

    flushSync(() => {
      root.render(
        <TerminalCommandDisplay
          command="cat logs.txt"
          output={manyLines}
          expandable={true}
          maxVisibleLines={5}
        />,
      )
    })

    try {
      await setup.renderOnce()
      const frame = setup.captureCharFrame()
      expect(frame).toContain('$ cat logs.txt')
      expect(frame).toContain('log line 1')
      expect(frame).toContain('log line 5')
      expect(frame).not.toContain('log line 10')
      expect(frame).toContain('Show 15 more lines')
    } finally {
      flushSync(() => root.unmount())
      setup.renderer.destroy()
    }
  })

  test('handles output where a single long line wraps', async () => {
    const setup = await createTestRenderer({ width: 40, height: 15 })
    const root = createRoot(setup.renderer)

    // A single line of 280 chars wraps into 7 visual lines on 40-col terminal
    const longLine = 'a'.repeat(280)

    flushSync(() => {
      root.render(
        <TerminalCommandDisplay
          command="echo long"
          output={longLine}
          expandable={true}
          maxVisibleLines={5}
          availableWidth={40}
        />,
      )
    })

    try {
      await setup.renderOnce()
      const frame = setup.captureCharFrame()
      expect(frame).toContain('$ echo long')
      expect(frame).toContain('Show')
    } finally {
      flushSync(() => root.unmount())
      setup.renderer.destroy()
    }
  })
})
