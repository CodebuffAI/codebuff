import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { FreebuffModelSelector } from '../freebuff-model-selector'
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
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

const renderSelector = async (maxHeight = 40) => {
  const setup = await createTestRenderer({ width: 100, height: 40 })
  const root = createRoot(setup.renderer)
  cleanupRenderer = () => {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }
  flushSync(() => root.render(<FreebuffModelSelector maxHeight={maxHeight} />))
  await setup.renderOnce()
  return setup
}

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

  const nextSetup = await renderSelector(30)
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

describe('FreebuffModelSelector tier layout', () => {
  test('orders Luna above MiniMax while keeping the saved premium model focused', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)

    const setup = await renderSelector()
    const frame = setup.captureCharFrame()
    const premiumHeaderIndex = frame.indexOf('PREMIUM')
    const selectedModelIndex = frame.indexOf('DeepSeek V4 Pro')
    const lunaModelIndex = frame.indexOf('GPT-5.6 Luna')
    const minimaxModelIndex = frame.indexOf('MiniMax M3')
    const unlimitedHeaderIndex = frame.indexOf('UNLIMITED')

    expect(premiumHeaderIndex).toBeGreaterThanOrEqual(0)
    expect(selectedModelIndex).toBeGreaterThan(premiumHeaderIndex)
    expect(lunaModelIndex).toBeGreaterThan(selectedModelIndex)
    expect(minimaxModelIndex).toBeGreaterThan(lunaModelIndex)
    expect(unlimitedHeaderIndex).toBeGreaterThan(minimaxModelIndex)
    expect(frame).toContain('› DeepSeek V4 Pro')
    expect(frame).not.toContain('› MiniMax M3')
  })

  test('places the exhausted-quota recommendation beneath UNLIMITED', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      rateLimitsByModel: {
        [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: {
          model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
          limit: 6,
          period: 'pacific_day',
          resetTimeZone: 'America/Los_Angeles',
          resetAt,
          windowHours: 24,
          recentCount: 6,
        },
      },
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_MINIMAX_M3_MODEL_ID)

    const setup = await renderSelector()
    const frame = setup.captureCharFrame()
    const premiumHeaderIndex = frame.indexOf('PREMIUM')
    const unlimitedHeaderIndex = frame.indexOf('UNLIMITED')
    const recommendedLabelIndex = frame.indexOf('RECOMMENDED')
    const recommendedModelIndex = frame.indexOf(
      'DeepSeek V4 Flash',
      recommendedLabelIndex,
    )

    expect(unlimitedHeaderIndex).toBeGreaterThan(premiumHeaderIndex)
    expect(recommendedLabelIndex).toBeGreaterThan(unlimitedHeaderIndex)
    expect(recommendedModelIndex).toBeGreaterThan(recommendedLabelIndex)
  })

  test('repairs an invalid selection to the unlimited recommendation when premium is exhausted', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      rateLimitsByModel: {
        [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: {
          model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
          limit: 6,
          period: 'pacific_day',
          resetTimeZone: 'America/Los_Angeles',
          resetAt,
          windowHours: 24,
          recentCount: 6,
        },
      },
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_GLM_V52_MODEL_ID)

    const setup = await renderSelector()
    await Promise.resolve()
    await setup.renderOnce()
    await setup.renderOnce()

    expect(getSelectedFreebuffModel()).toBe(
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(setup.captureCharFrame()).toContain('› DeepSeek V4 Flash')
  })

  test('shows every limited-tier model when the access tier arrives after mount', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)
    const setup = await renderSelector()

    flushSync(() => {
      useFreebuffSessionStore.getState().setSession({
        status: 'none',
        accessTier: 'limited',
      })
    })
    await Promise.resolve()
    await setup.renderOnce()
    await setup.renderOnce()

    const frame = setup.captureCharFrame()
    expect(frame).toContain('DeepSeek V4 Flash')
    expect(frame).toContain('MiMo 2.5')
    expect(frame).not.toContain('PREMIUM')
    expect(frame).not.toContain('UNLIMITED')
  })
})
