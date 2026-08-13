import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import React from 'react'

import { useClipboard } from '../use-clipboard'
import * as clipboard from '../../utils/clipboard'

import type { CopyToClipboardOptions } from '../../utils/clipboard'

const waitForSelectionCopy = () =>
  new Promise((resolve) => setTimeout(resolve, 300))

describe('useClipboard selection copying', () => {
  let dispose: (() => void) | undefined

  afterEach(() => {
    dispose?.()
    dispose = undefined
  })

  test('a newer selection aborts the in-flight copy before starting its own', async () => {
    const calls: Array<{
      text: string
      signal: AbortSignal
      resolve: () => void
    }> = []
    const copySpy = spyOn(clipboard, 'copyTextToClipboard').mockImplementation(
      (text: string, options: CopyToClipboardOptions = {}) =>
        new Promise<void>((resolve, reject) => {
          const signal = options.signal!
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
          calls.push({ text, signal, resolve })
        }),
    )

    const Harness = () => {
      useClipboard()
      return <text>clipboard</text>
    }
    const setup = await createTestRenderer({ width: 20, height: 2 })
    const root = createRoot(setup.renderer)
    flushSync(() => root.render(<Harness />))
    await setup.renderOnce()
    dispose = () => {
      copySpy.mockRestore()
      flushSync(() => root.unmount())
      setup.renderer.destroy()
    }

    setup.renderer.emit('selection', {
      getSelectedText: () => 'first selection',
    } as never)
    await waitForSelectionCopy()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.signal.aborted).toBe(false)

    setup.renderer.emit('selection', {
      getSelectedText: () => 'second selection',
    } as never)
    expect(calls[0]?.signal.aborted).toBe(true)
    await waitForSelectionCopy()

    expect(calls.map(({ text }) => text)).toEqual([
      'first selection',
      'second selection',
    ])
    expect(calls[1]?.signal.aborted).toBe(false)
    calls[1]?.resolve()
  })
})
