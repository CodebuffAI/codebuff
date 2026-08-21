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

/**
 * The instant every render in this file happens at.
 *
 * Row availability is time-of-day dependent, so reading the real clock made
 * these assertions depend on the hour CI ran at: V4 Pro is `off_peak_only` and
 * closes for DeepSeek's expensive window (00:00-10:00 UTC), and a closed row
 * draws no supersession notice and is not joinable — which is how the
 * switch-to-Flash test went red on an unrelated PR (#1927) and green on one
 * merged the same day (#1924).
 *
 * 19:00 UTC on a fixed date is outside that window AND inside deployment hours
 * (15:00 Eastern, 12:00 Pacific), so every catalog row is open here regardless
 * of which of the two availability rules it carries. The relative fixtures
 * below are built from this same instant rather than the real clock, or a
 * countdown measured against the frozen picker would run backwards.
 */
const FIXED_NOW_MS = Date.UTC(2026, 7, 20, 19, 0, 0)

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
  flushSync(() =>
    root.render(
      <FreebuffModelSelector maxHeight={maxHeight} nowMs={FIXED_NOW_MS} />,
    ),
  )
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
      resetAt: new Date(FIXED_NOW_MS + 60_000).toISOString(),
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
        resetAt: new Date(FIXED_NOW_MS + 60_000).toISOString(),
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

  test('orders the premium rows above UNLIMITED, saved model focused', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    // The saved pick has to be something OTHER than the recommended hero, or
    // the landing picker opens collapsed and there are no tier headers to
    // order. The hero is DeepSeek V4 Flash again since 2026-08-20, so Luna is
    // the premium row that exercises "saved model stays focused" here.
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)

    const setup = await renderSelector()
    const frame = setup.captureCharFrame()
    const premiumHeaderIndex = frame.indexOf('PREMIUM')
    const recommendedModelIndex = frame.indexOf('DeepSeek V4 Flash')
    const selectedModelIndex = frame.indexOf('GPT-5.6 Luna')
    const unlimitedHeaderIndex = frame.indexOf('UNLIMITED')

    expect(premiumHeaderIndex).toBeGreaterThanOrEqual(0)
    expect(recommendedModelIndex).toBeGreaterThan(premiumHeaderIndex)
    expect(selectedModelIndex).toBeGreaterThan(recommendedModelIndex)
    // MiniMax M3 anchored the tail of this list until it was withdrawn on
    // 2026-08-20 and left the picker entirely.
    expect(unlimitedHeaderIndex).toBeGreaterThan(selectedModelIndex)
    // The cursor sits on the SAVED pick, not on the recommendation.
    expect(frame).toContain('› GPT-5.6 Luna')
    expect(frame).not.toContain('› MiniMax M3')
  })

  /**
   * ARMED, NOT DELETED. The catalog carries NO supersedes notice as of
   * 2026-08-21: V4 Pro held the last one ("V4 Flash is what we recommend") and
   * it was removed when Pro moved to a flat-priced lane and Flash became the
   * row that sleeps at peak — pointing Pro at Flash now steers users to a model
   * that is closed for ten hours precisely when Pro is their best option.
   *
   * The RULE this guards — only the selected row nags, so the list does not
   * repeat one notice on every row it applies to — is UI logic that outlives
   * any particular pair of models, so it runs again automatically the next time
   * a supersedes notice exists rather than being re-derived from a regression.
   */
  const allModelIds = FREEBUFF_MODELS.map((m) => m.id)
  const supersededModelId = allModelIds.find((id) =>
    getFreebuffModelSupersededBy(id, allModelIds),
  )
  test.if(Boolean(supersededModelId))(
    'shows the supersedes nudge only on the row the user is on',
    async () => {
      useFreebuffSessionStore.getState().setSession({
        status: 'none',
        accessTier: 'full',
      })
      // Assert against the real copy rather than a hardcoded fragment, so
      // rewording the notice doesn't fail this test for the wrong reason. It
      // must still render on ONE line — the width math reserves its length.
      const superseded = getFreebuffModelSupersededBy(
        supersededModelId!,
        allModelIds,
      )!
      const notice = superseded.notice
      const occurrences = (frame: string) => frame.split(notice).length - 1

      // On a superseded model: the nudge appears, once, on that model's card.
      useFreebuffModelStore.getState().setSelectedModel(supersededModelId!)
      const onSuperseded = (await renderSelector()).captureCharFrame()
      expect(occurrences(onSuperseded)).toBe(1)

      // On a row that is NOT superseded, that notice stays quiet — otherwise
      // the list would repeat it on every row it applies to.
      const otherId = allModelIds.find((id) => id !== supersededModelId)!
      useFreebuffModelStore.getState().setSelectedModel(otherId)
      const onOther = (await renderSelector()).captureCharFrame()
      expect(occurrences(onOther)).toBe(0)

      // And on the replacement itself: no nudge at all.
      useFreebuffModelStore
        .getState()
        .setSelectedModel(superseded.modelId)
      const onCurrent = (await renderSelector()).captureCharFrame()
      expect(occurrences(onCurrent)).toBe(0)
    },
  )

  test('badges the new builds so a returning user notices they changed', async () => {
    // Independent of the supersedes machinery above, which is why it is its own
    // test now: `isNew` is a property of the row, and Flash still carries it.
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    // Selected explicitly: `isNew` sits on the V4 Flash row, and the collapsed
    // view draws only the card the user is on — which is V4 Pro by default
    // since 2026-08-21, and carries no badge.
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).toContain('DeepSeek V4 Flash 07/31')
    expect(frame).toContain('NEW')
  })

  test('places the exhausted-quota recommendation beneath UNLIMITED', async () => {
    const resetAt = new Date(FIXED_NOW_MS + 60_000).toISOString()
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
    // Located by the ROW rather than by a ' RECOMMENDED ' border title, which
    // was removed on 2026-08-21 — nothing in the picker is badged as a
    // recommendation any more. The property under test is unchanged: when the
    // premium pool is spent, the row the user is steered onto sits in the
    // UNLIMITED group rather than above the list.
    //
    // MiMo 2.5 is that row since 2026-08-18 — Flash moved into the premium
    // group and can no longer be what a spent user lands on.
    const heroModelIndex = frame.indexOf('MiMo 2.5', unlimitedHeaderIndex)

    expect(unlimitedHeaderIndex).toBeGreaterThan(premiumHeaderIndex)
    expect(heroModelIndex).toBeGreaterThan(unlimitedHeaderIndex)
  })

  test('collapses to the unlimited hero when the premium default is spent', async () => {
    // The default selection has been premium since 2026-08-12, so a returning
    // user who has spent their pool opens the picker already sitting on a row
    // `pick` silently refuses. Both the selection AND the cursor have to leave
    // it, or Enter does nothing with no explanation — and the picker has to
    // collapse onto the replacement, or it opens on three greyed, unusable
    // premium rows with the recommendation fourth.
    const resetAt = new Date(FIXED_NOW_MS + 60_000).toISOString()
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      // Keyed on the CURRENT default rather than on a named model: the default
      // moved from Flash to V4 Pro on 2026-08-21, and this fixture has to
      // exhaust the pool of whichever row the picker will actually open on, or
      // the step-down under test never triggers.
      rateLimitsByModel: {
        [DEFAULT_FREEBUFF_MODEL_ID]: {
          model: DEFAULT_FREEBUFF_MODEL_ID,
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
    const resetAt = new Date(FIXED_NOW_MS + 60_000).toISOString()
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
    expect(rowOf(frame, 'MiMo 2.5')).toContain('Images')
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
        userResetAt: new Date(FIXED_NOW_MS + 5 * 60 * 60_000).toISOString(),
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
          userResetAt: new Date(FIXED_NOW_MS + 60_000).toISOString(),
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
