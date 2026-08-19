import { FREEBUFF_EARN_PROMPT_SHORT } from '@codebuff/common/constants/freebuff-levels'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { FreebuffModelSelector } from '../freebuff-model-selector'
import {
  DEFAULT_FREEBUFF_MODEL_ID,
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_FABLE_5_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_MODELS,
  getFreebuffModelSupersededBy,
  isFreebuffModelId,
  LIMITED_FREEBUFF_MODELS,
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
  useFreebuffSessionStore.getState().setFailure(null)
  useFreebuffModelStore.getState().setSelectedModel(FALLBACK_FREEBUFF_MODEL_ID)
})

const renderSelector = async (maxHeight = 40) => {
  // Tear down any selector this test already rendered. Only the LAST one was
  // reachable from afterEach, so a test that renders twice used to leave the
  // earlier root mounted — and a mounted selector keeps running its landing
  // repair effect, rewriting the shared model store out from under whichever
  // test ran next.
  cleanupRenderer?.()
  cleanupRenderer = undefined
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
  test('keeps the referral actions on one condensed row', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      referral: {
        code: 'test-referral',
        referrerName: null,
        qualifiedCount: 0,
        weeklySessionsRemaining: 0,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
        githubLinked: true,
      },
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_MINIMAX_M3_MODEL_ID)

    const frame = (await renderSelector()).captureCharFrame()
    const actionRow =
      frame.split('\n').find((line) => line.includes('Copy invite link')) ?? ''

    // The label is shared with Desktop and the browser
    // (FREEBUFF_EARN_PROMPT_SHORT), so asserting the constant rather than the
    // string keeps the three surfaces free to be re-worded together — which is
    // the whole reason it is shared. What this test is really pinning is that
    // it sits on the SAME row as the copy control.
    expect(actionRow).toContain(FREEBUFF_EARN_PROMPT_SHORT)
    expect(frame).not.toContain('Or earn')
    expect(frame).not.toContain('for small tasks')
  })

  test('orders Luna above MiniMax while keeping the saved premium model focused', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    // The saved pick has to be something OTHER than the recommended hero, or
    // the landing picker opens collapsed and there are no tier headers to
    // order. The hero is GPT-5.6 Luna since 2026-08-19, so DeepSeek V4 Flash is
    // the premium row that exercises "saved model stays focused" here.
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)

    const setup = await renderSelector()
    const frame = setup.captureCharFrame()
    const premiumHeaderIndex = frame.indexOf('PREMIUM')
    const recommendedModelIndex = frame.indexOf('GPT-5.6 Luna')
    const selectedModelIndex = frame.indexOf('DeepSeek V4 Flash')
    const minimaxModelIndex = frame.indexOf('MiniMax M3')
    const unlimitedHeaderIndex = frame.indexOf('UNLIMITED')

    expect(premiumHeaderIndex).toBeGreaterThanOrEqual(0)
    expect(recommendedModelIndex).toBeGreaterThan(premiumHeaderIndex)
    expect(selectedModelIndex).toBeGreaterThan(recommendedModelIndex)
    expect(minimaxModelIndex).toBeGreaterThan(selectedModelIndex)
    expect(unlimitedHeaderIndex).toBeGreaterThan(minimaxModelIndex)
    // The cursor sits on the SAVED pick, not on the recommendation.
    expect(frame).toContain('› DeepSeek V4 Flash')
    expect(frame).not.toContain('› MiniMax M3')
  })

  test('shows the switch-to-Flash nudge only on the row the user is on', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    // Assert against the real copy rather than a hardcoded fragment, so
    // rewording the notice doesn't fail this test for the wrong reason. It must
    // still render on ONE line — the width math reserves exactly its length.
    const notice = getFreebuffModelSupersededBy(
      FREEBUFF_MINIMAX_M3_MODEL_ID,
      FREEBUFF_MODELS.map((m) => m.id),
    )!.notice
    const occurrences = (frame: string) => frame.split(notice).length - 1

    // On a superseded model: the nudge appears, once, on that model's card.
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_MINIMAX_M3_MODEL_ID)
    const onSuperseded = (await renderSelector()).captureCharFrame()
    expect(occurrences(onSuperseded)).toBe(1)
    // It names the dated build, which is what the row it steers to is labelled.
    expect(notice).toContain('DeepSeek V4 Flash 07/31')
    // The new builds are badged so a returning user notices they changed.
    expect(onSuperseded).toContain('NEW')

    // MiMo is superseded too and is on screen here, but only the selected row
    // nags — otherwise the list would repeat the same notice on every row it
    // applies to. MiMo 2.5 is on screen and, when it is not the selection, its
    // own notice stays quiet. (V4 Pro played this part until it was paused on
    // 2026-08-18 and left the picker entirely.)
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_MIMO_V25_MODEL_ID)
    const onUnsuperseded = (await renderSelector()).captureCharFrame()
    expect(onUnsuperseded).toContain('MiMo 2.5')

    // On the replacement itself: no nudge at all. (Picking the recommended
    // model also collapses the picker to its hero card.)
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    const onCurrent = (await renderSelector()).captureCharFrame()
    expect(occurrences(onCurrent)).toBe(0)
  })

  test('places the exhausted-quota recommendation beneath UNLIMITED', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      rateLimitsByModel: {
        [FREEBUFF_GPT_5_6_LUNA_MODEL_ID]: {
          model: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
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
    // The unlimited recommendation is MiMo 2.5 since 2026-08-18 — Flash moved
    // into the premium group and can no longer be what a spent user lands on.
    const recommendedModelIndex = frame.indexOf(
      'MiMo 2.5',
      recommendedLabelIndex,
    )

    expect(unlimitedHeaderIndex).toBeGreaterThan(premiumHeaderIndex)
    expect(recommendedLabelIndex).toBeGreaterThan(unlimitedHeaderIndex)
    expect(recommendedModelIndex).toBeGreaterThan(recommendedLabelIndex)
  })

  test('collapses to the unlimited hero when the premium default is spent', async () => {
    // The default selection has been premium since 2026-08-12, so a returning
    // user who has spent their pool opens the picker already sitting on a row
    // `pick` silently refuses. Both the selection AND the cursor have to leave
    // it, or Enter does nothing with no explanation — and the picker has to
    // collapse onto the replacement, or it opens on three greyed, unusable
    // premium rows with the recommendation fourth.
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      rateLimitsByModel: {
        [FREEBUFF_GPT_5_6_LUNA_MODEL_ID]: {
          model: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
          limit: 6,
          period: 'pacific_day',
          resetTimeZone: 'America/Los_Angeles',
          resetAt,
          windowHours: 24,
          recentCount: 6,
        },
      },
    })
    useFreebuffModelStore.getState().setSelectedModel(DEFAULT_FREEBUFF_MODEL_ID)

    const setup = await renderSelector()
    await Promise.resolve()
    await setup.renderOnce()
    await setup.renderOnce()

    expect(getSelectedFreebuffModel()).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    const frame = setup.captureCharFrame()
    // `›` is the cursor: it has to be on the row Enter now commits.
    expect(frame).toContain('› MiMo 2.5')
    // …and that row is the whole screen, exactly as for a user who is already
    // on the recommendation. The spent rows live behind the toggle.
    expect(frame).toContain('See all')
    expect(frame).not.toContain('PREMIUM')
  })

  test('repairs an invalid selection to the unlimited recommendation when premium is exhausted', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      rateLimitsByModel: {
        [FREEBUFF_GPT_5_6_LUNA_MODEL_ID]: {
          model: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
          limit: 6,
          period: 'pacific_day',
          resetTimeZone: 'America/Los_Angeles',
          resetAt,
          windowHours: 24,
          recentCount: 6,
        },
      },
    })
    useFreebuffModelStore.getState().setSelectedModel(FREEBUFF_GLM_V52_MODEL_ID)

    const setup = await renderSelector()
    await Promise.resolve()
    await setup.renderOnce()
    await setup.renderOnce()

    expect(getSelectedFreebuffModel()).toBe(FALLBACK_FREEBUFF_MODEL_ID)
    expect(setup.captureCharFrame()).toContain('› MiMo 2.5')
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
    // From the catalog, not a hardcoded list: the point is that NONE of the
    // tier's rows stay hidden when the tier arrives late.
    for (const model of LIMITED_FREEBUFF_MODELS) {
      expect(frame).toContain(model.displayName)
    }
    // The pre-transition pick was a full-access model, so this is the path
    // where a paused row would linger.
    expect(frame).not.toContain('DeepSeek V4 Flash')
    expect(frame).not.toContain('PREMIUM')
    expect(frame).not.toContain('UNLIMITED')
  })

  test('badges only natively multimodal rows with Images', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    // Expanded (a saved non-recommended pick) so every row is on screen.
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_MINIMAX_M3_MODEL_ID)

    const rowOf = (frame: string, name: string) =>
      frame.split('\n').find((line) => line.includes(name)) ?? ''
    const frame = (await renderSelector()).captureCharFrame()

    // Natively multimodal: the badge is a real capability claim.
    expect(rowOf(frame, 'MiniMax M3')).toContain('Images')
    expect(rowOf(frame, 'GPT-5.6 Luna')).toContain('Images')
    expect(rowOf(frame, 'MiMo 2.5')).toContain('Images')
    // Text-only. They still accept a pasted image (read server-side as a
    // description), but badging them made the label mean nothing — and the
    // badge is what widened the hero card.
    expect(rowOf(frame, 'DeepSeek V4 Flash')).not.toContain('Images')
    expect(rowOf(frame, 'DeepSeek V4 Pro')).not.toContain('Images')
  })

  test('says the reasoning effort on rows whose catalog entry carries one', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_MINIMAX_M3_MODEL_ID)

    // Anchored on taglines: model names also appear in superseded-notice lines
    const rowOf = (frame: string, tagline: string) =>
      frame.split('\n').find((line) => line.includes(tagline)) ?? ''
    const frame = (await renderSelector()).captureCharFrame()

    expect(rowOf(frame, 'Smart & Fast')).toContain('Reasoning: high')
    const lunaRow = rowOf(frame, 'GPT-5.6 Luna')
    expect(lunaRow).toContain('Strong all-around')
    expect(lunaRow).toContain('Reasoning: high')
    expect(rowOf(frame, 'MiniMax M3')).not.toContain('Reasoning')
  })

  test('sizes the hero card to its content, with no Press-Enter gutter', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)

    const frame = (await renderSelector()).captureCharFrame()
    // trimEnd drops the terminal's blank columns to the right of the card, so
    // what's left ends at the card's own right border.
    const heroRow = (
      frame.split('\n').find((line) => line.includes('› DeepSeek V4 Flash')) ??
      ''
    ).trimEnd()

    expect(frame).not.toContain('Press Enter')
    // The reserved cue gutter used to sit between the last badge and the right
    // border, padding the card out by ~17 columns of empty space. What remains
    // is ordinary slack from the widest row in the set.
    const gapToBorder =
      heroRow.length - 1 - (heroRow.indexOf('NEW') + 'NEW'.length)
    expect(heroRow.endsWith('│')).toBe(true)
    expect(gapToBorder).toBeLessThan(10)
  })
})

describe('FreebuffModelSelector limited-model offer', () => {
  const offerSession = (
    offer: Partial<{
      remaining: number
      total: number
      userRemaining: number
      userResetAt: string
    }> = {},
  ) => ({
    status: 'none' as const,
    accessTier: 'full' as const,
    limitedModelOffers: [
      {
        model: FREEBUFF_FABLE_5_MODEL_ID,
        remaining: 38,
        total: 50,
        userRemaining: 1,
        userResetAt: new Date(Date.now() + 5 * 60 * 60_000).toISOString(),
        ...offer,
      },
    ],
  })

  test('renders nothing when the server sends no offer', async () => {
    // The regression that matters most: a user who is not in the wave must see
    // the picker exactly as it was before the offer existed.
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).not.toContain('LIMITED TRIAL')
    expect(frame).not.toContain('Fable')
  })

  test('renders the offered model with its scarcity and data-use label', async () => {
    useFreebuffSessionStore.getState().setSession(offerSession())
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).toContain('LIMITED TRIAL')
    expect(frame).toContain('38 of 50 sessions left')
    expect(frame).toContain('Claude Fable 5')
    // The disclosure that makes collecting the traces legitimate travels on the
    // row itself, not in a footnote somewhere else.
    expect(frame).toContain('May use data for AI training')
  })

  test('stays visible while collapsed, unlike the ordinary tiers', async () => {
    // The picker opens collapsed for a user already on the recommended model.
    // A wave nobody sees is a wave nobody joins. Read off the constant so the
    // collapsed state survives the next flip of the recommended default.
    useFreebuffModelStore.getState().setSelectedModel(DEFAULT_FREEBUFF_MODEL_ID)
    useFreebuffSessionStore.getState().setSession(offerSession())
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).toContain('See all')
    expect(frame).toContain('Claude Fable 5')
    expect(frame).not.toContain('PREMIUM')
  })

  test('explains a spent personal allowance instead of hiding the row', async () => {
    useFreebuffSessionStore
      .getState()
      .setSession(offerSession({ userRemaining: 0 }))
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).toContain('Claude Fable 5')
    expect(frame).toContain("you've used yours")
    expect(frame).toContain('resets in')
  })

  test('drops an offer this build has no catalog entry for', async () => {
    // A server rolling out a model older clients don't know must be a no-op,
    // not a row with a blank name and no data-use warning.
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      limitedModelOffers: [
        {
          model: 'someone/unreleased-model-9',
          remaining: 5,
          total: 50,
          userRemaining: 1,
          userResetAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    })
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).not.toContain('LIMITED TRIAL')
    expect(frame).not.toContain('unreleased-model-9')
  })

  test('keeps an offered selection instead of repairing it away', async () => {
    // The offer model is not in FREEBUFF_MODELS, so the picker's
    // invalid-selection repair would otherwise bounce the user off the row they
    // just picked.
    useFreebuffSessionStore.getState().setSession(offerSession())
    useFreebuffModelStore.getState().setSelectedModel(FREEBUFF_FABLE_5_MODEL_ID)
    await renderSelector()
    expect(getSelectedFreebuffModel()).toBe(FREEBUFF_FABLE_5_MODEL_ID)
  })

  test('repairs the selection once the wave ends', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    useFreebuffModelStore.getState().setSelectedModel(FREEBUFF_FABLE_5_MODEL_ID)
    await renderSelector()
    expect(isFreebuffModelId(getSelectedFreebuffModel())).toBe(true)
  })
})
