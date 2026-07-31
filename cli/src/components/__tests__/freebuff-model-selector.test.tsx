import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { FreebuffModelSelector } from '../freebuff-model-selector'
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  isFreebuffModelId,
} from '@codebuff/common/constants/freebuff-models'

import { initializeThemeStore } from '../../hooks/use-theme'
import {
  getSelectedFreebuffModel,
  useFreebuffModelStore,
} from '../../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../../state/freebuff-session-store'

let cleanupRenderer: (() => void) | undefined

beforeAll(() => {
  initializeThemeStore()
})

afterEach(() => {
  cleanupRenderer?.()
  cleanupRenderer = undefined
  useFreebuffSessionStore.getState().setSession(null)
  useFreebuffSessionStore.getState().setError(null)
  useFreebuffModelStore.getState().setSelectedModel(FALLBACK_FREEBUFF_MODEL_ID)
})

const renderSelectorWithGlmRemaining = async (remaining?: number) => {
  useFreebuffSessionStore.getState().setSession({
    status: 'none',
    accessTier: 'full',
    referral: {
      code: 'test-referral',
      referrerName: null,
      qualifiedCount: 1,
      ...(remaining === undefined
        ? {}
        : { weeklySessionsRemaining: remaining }),
      resetAt: new Date(Date.now() + 60_000).toISOString(),
      githubLinked: true,
    },
  })
  useFreebuffModelStore.getState().setSelectedModel(FREEBUFF_GLM_V52_MODEL_ID)

  const nextSetup = await createTestRenderer({ width: 100, height: 40 })
  const nextRoot = createRoot(nextSetup.renderer)
  cleanupRenderer = () => {
    flushSync(() => nextRoot.unmount())
    nextSetup.renderer.destroy()
  }
  flushSync(() => nextRoot.render(<FreebuffModelSelector maxHeight={30} />))
  await nextSetup.renderOnce()
  await Promise.resolve()
  await nextSetup.renderOnce()
}

describe('FreebuffModelSelector referral selection', () => {
  test('keeps a fractional unlocked GLM session selected while its request is pending', async () => {
    await renderSelectorWithGlmRemaining(0.25)
    expect(getSelectedFreebuffModel()).toBe(FREEBUFF_GLM_V52_MODEL_ID)
  })

  test('still repairs a locked GLM selection to a visible grid model', async () => {
    await renderSelectorWithGlmRemaining(0)
    expect(isFreebuffModelId(getSelectedFreebuffModel())).toBe(true)
  })

  test('treats an omitted GLM balance as locked', async () => {
    await renderSelectorWithGlmRemaining()
    expect(isFreebuffModelId(getSelectedFreebuffModel())).toBe(true)
  })
})
