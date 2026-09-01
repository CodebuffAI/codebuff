import { FREEBUFF_EARN_PROMPT_SHORT } from '@codebuff/common/constants/freebuff-levels'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { FreebuffModelSelector } from '../freebuff-model-selector'
import {
  FREEBUFF_REWARD_MODEL_ID,
  DEFAULT_FREEBUFF_MODEL_ID,
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_GLM_V53_FLASH_MODEL_ID,
  FREEBUFF_SOLAR_PRO_4_MODEL_ID,
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

/**
 * LIMITED tier, which since 2026-08-31 is the only tier where the reward is a
 * MODEL you can select. At full access the reward is an extra premium session
 * and the reward model is an ordinary unmetered grid row, so there is no
 * earned selection there for the landing repair to keep or discard.
 */
const renderSelectorWithGlmRemaining = async (remaining?: number) => {
  useFreebuffSessionStore.getState().setSession({
    status: 'none',
    accessTier: 'limited',
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
  useFreebuffModelStore.getState().setSelectedModel(FREEBUFF_REWARD_MODEL_ID)

  const nextSetup = await renderSelector(30)
  await nextSetup.renderOnce()
  await Promise.resolve()
  await nextSetup.renderOnce()
}

describe('FreebuffModelSelector referral selection', () => {
  test('keeps a fractional unlocked reward session selected while its request is pending', async () => {
    await renderSelectorWithGlmRemaining(0.25)
    expect(getSelectedFreebuffModel()).toBe(FREEBUFF_REWARD_MODEL_ID)
  })

  test('still repairs a locked reward selection to a visible grid model', async () => {
    await renderSelectorWithGlmRemaining(0)
    expect(isFreebuffModelId(getSelectedFreebuffModel())).toBe(true)
  })

  test('treats an omitted reward balance as locked', async () => {
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
    // The saved pick has to be a PREMIUM row that is NOT the recommended hero:
    // premium or the tier headers it is being ordered against don't apply to
    // it, non-hero or the landing picker opens collapsed and there are no tier
    // headers at all. The hero is GPT-5.6 Luna since 2026-08-24, which leaves
    // exactly one other premium row — Solar Pro 4 today.
    //
    // The occupants keep leaving downward: V4 Flash left
    // FREEBUFF_PREMIUM_MODEL_IDS on 2026-08-24, V4 Pro was withdrawn on 08-26,
    // GLM 5.3 Flash was un-premiumed on 08-28 and moved into UNLIMITED — below
    // the header this asserts it sits above. Read the list, not this comment.
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_SOLAR_PRO_4_MODEL_ID)

    const setup = await renderSelector()
    const frame = setup.captureCharFrame()
    const premiumHeaderIndex = frame.indexOf('PREMIUM')
    const recommendedModelIndex = frame.indexOf('GPT-5.6 Luna')
    const selectedModelIndex = frame.indexOf('Solar Pro 4')
    const unlimitedHeaderIndex = frame.indexOf('UNLIMITED')

    expect(premiumHeaderIndex).toBeGreaterThanOrEqual(0)
    expect(recommendedModelIndex).toBeGreaterThan(premiumHeaderIndex)
    expect(selectedModelIndex).toBeGreaterThan(recommendedModelIndex)
    // MiniMax M3 anchored the tail of this list until it was withdrawn on
    // 2026-08-20 and left the picker entirely.
    expect(unlimitedHeaderIndex).toBeGreaterThan(selectedModelIndex)
    // The cursor sits on the SAVED pick, not on the recommendation.
    expect(frame).toContain('› Solar Pro 4')
    expect(frame).not.toContain('› GPT-5.6 Luna')
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
      useFreebuffModelStore.getState().setSelectedModel(superseded.modelId)
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
    // A returning user sitting on a spent PREMIUM row opens the picker already
    // on a row `pick` silently refuses. Both the selection AND the cursor have
    // to leave it, or Enter does nothing with no explanation — and the picker
    // has to collapse onto the replacement, or it opens on greyed, unusable
    // premium rows with the recommendation below them.
    //
    // KEYED ON A PREMIUM ROW (Luna), NOT ON THE DEFAULT. It used to key on
    // DEFAULT_FREEBUFF_MODEL_ID, which was right for as long as every default
    // was premium — 2026-08-12 to 08-30. The default is now unmetered, so
    // exhausting "its pool" exhausts nothing and the step-down under test never
    // fires. Keying on the row that actually HAS a pool keeps this covering the
    // behaviour rather than passing vacuously.
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
      .setSelectedModel(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)

    const setup = await renderSelector()
    await Promise.resolve()
    await setup.renderOnce()
    await setup.renderOnce()

    // Lands on the RECOMMENDATION, which is now unmetered — so unlike every
    // version of this test since 2026-08-12 the destination is not the
    // fallback. The user is moved off the row they cannot use and onto the one
    // the picker leads with, rather than being demoted two steps.
    expect(getSelectedFreebuffModel()).toBe(DEFAULT_FREEBUFF_MODEL_ID)
    const frame = setup.captureCharFrame()
    // `›` is the cursor: it has to be on the row Enter now commits.
    expect(frame).toContain('› GLM 5.3 Flash')
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

    // Repaired onto the recommendation. Was the fallback while the default was
    // premium; an unmetered default is always joinable, so an invalid selection
    // now lands on the row the picker leads with.
    expect(getSelectedFreebuffModel()).toBe(DEFAULT_FREEBUFF_MODEL_ID)
    expect(setup.captureCharFrame()).toContain('› GLM 5.3 Flash')
  })

  test('shows every limited-tier model when the access tier arrives after mount', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_GLM_V53_FLASH_MODEL_ID)
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

  test('sizes and centres a row around its per-row quota chip', async () => {
    // The chip is drawn on a row that answers to a DIFFERENT pool than its
    // section header, and it was missing from BOTH the centering math and the
    // height estimate — visible only once a user had spent a Luna session,
    // until the server began sending unused pool rows and it became every
    // full-access picker.
    //
    // WHICH row wears it is arithmetic, not semantic: getFreebuffSectionQuotas
    // gives the header to the pool MOST rows share and breaks ties toward the
    // earlier row. The occupant has moved with every premium departure — Flash
    // out on 2026-08-24, V4 Pro withdrawn 08-26, GLM 5.3 Flash un-premiumed
    // 08-28. The invariant under test — a second line the width and height math
    // must both know about — is unchanged; only the row it lands on moves, so
    // this drives it from the CURRENT premium list rather than naming a row.
    const resetAt = new Date(FIXED_NOW_MS + 60_000).toISOString()
    const pool = (
      model: string,
      poolId: string,
      poolLabel: string,
      limit: number,
    ) => ({
      model,
      pool: poolId,
      poolLabel,
      limit,
      period: 'pacific_day' as const,
      resetTimeZone: 'America/Los_Angeles',
      resetAt,
      windowHours: 24,
      recentCount: 0,
    })
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      // Flash sends no pool row at all since 2026-08-24: it is unmetered.
      rateLimitsByModel: {
        [FREEBUFF_GPT_5_6_LUNA_MODEL_ID]: pool(
          FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
          'premium',
          'Premium',
          4,
        ),
        // A row answering to a pool the section header does NOT speak for, so
        // it carries its own chip. SYNTHESISED rather than read from
        // FREEBUFF_PER_MODEL_SESSION_CAPS, which is empty since 2026-08-28 —
        // this test is about the width and height math around a second line,
        // not about which model happens to be capped this week, and tying it to
        // a real cap is what made it break every time one moved.
        [FREEBUFF_SOLAR_PRO_4_MODEL_ID]: pool(
          FREEBUFF_SOLAR_PRO_4_MODEL_ID,
          'solar_trial',
          'Solar Pro 4',
          2,
        ),
      },
    })
    useFreebuffModelStore
      .getState()
      // NOT the hero, so the picker opens expanded and the chip under test is
      // drawn at all. Luna took the hero slot on 2026-08-24; selecting it here
      // collapses the list to a single row and the chip disappears. V4 Flash
      // also supplies the warning-ONLY second line asserted below, which the
      // chip row cannot: every row carrying a pool row here also carries a
      // chip.
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)

    const frame = (await renderSelector()).captureCharFrame()
    // Gutters inside the card borders, which is what "centred" means here and
    // what a length the math didn't know about throws off. Asserted for the
    // ordinary warning line too, so this pins the invariant rather than the
    // one string that broke it.
    const gutters = (line: string) => {
      const inner = line.slice(line.indexOf('│') + 1, line.lastIndexOf('│'))
      return [
        inner.length - inner.trimStart().length,
        inner.length - inner.trimEnd().length,
      ]
    }
    const lines = frame.split('\n')
    // The second line carrying a per-row chip. Anchored on the chip TEXT, so a
    // chip that stops being drawn fails here rather than quietly re-measuring
    // some warning-only line instead. A per-row label is longer than the shared
    // one, which is the case the width math has to survive.
    const chipLine = lines.find((l) => l.includes('Solar Pro 4: 0 of 2 used'))
    // Flash carries the training warning with nothing after it — the shape the
    // width math already handled, which is the "ordinary warning line" above.
    const warningOnlyLine = lines.find(
      (l) => l.includes('May use data for AI training') && !l.includes('used'),
    )
    expect(chipLine).toBeDefined()
    expect(warningOnlyLine).toBeDefined()
    for (const line of [chipLine!, warningOnlyLine!]) {
      const [left, right] = gutters(line)
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
    }
    // A row the height estimate does not know has a second line costs the list
    // a row on the first frame, which cut the toggle off the bottom.
    expect(frame).toContain('Show fewer')
  })

  test('says nothing about a premium quota the account does not have', async () => {
    // Quota-exempt accounts (god/admin) draw on no free pool, so no snapshot
    // arrives. The header used to fall back to the static limit and render
    // "0 of 4 used · resets in 11h 43m" for an account with neither.
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
    })
    // A row that isn't the hero, so the picker opens expanded and the PREMIUM
    // header is actually drawn. Flash since 2026-08-24 -- Luna took the hero
    // slot, so selecting Luna here would collapse the list. The assertion is
    // the ABSENCE of numbers on that header, so the fact that Flash itself
    // stopped being premium that same day changes nothing here.
    useFreebuffModelStore
      .getState()
      .setSelectedModel(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)

    const frame = (await renderSelector()).captureCharFrame()
    // The section still groups the rows; only the invented numbers are gone.
    expect(frame).toContain('PREMIUM')
    expect(frame).not.toContain('used')
    expect(frame).not.toContain('resets in')
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
    //
    // So this bound tracks the WIDEST ROW, not the hero's own content, and it
    // moves whenever any row in the set grows. It went 10 -> 14 when GLM 5.3
    // Flash gained a reasoning ladder, which widens its row two different ways:
    // a model with a pinned `reasoningEffort` shows ` · Reasoning: <rung>`, and
    // a model the user has picked a rung for shows ` · Reasoning: <rung>*`
    // whether or not one is pinned (see reasoningSuffixFor). GLM 5.3 Flash has
    // no pinned effort — it runs at the provider's own setting — but an earlier
    // test in this file leaves a saved pick in the store, so the starred form is
    // what is actually being measured here. That is the card sizing itself to
    // its content, which is the behaviour under test.
    //
    // Kept well under 17 deliberately — the number has to stay small enough to
    // fail if the reserved gutter ever comes back, which is the only thing this
    // assertion is really guarding. Widen it again only for a real content
    // change, and check WHICH row got wider before you do.
    const gapToBorder =
      heroRow.length - 1 - (heroRow.indexOf('NEW') + 'NEW'.length)
    expect(heroRow.endsWith('│')).toBe(true)
    expect(gapToBorder).toBeLessThan(14)
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

describe('FreebuffModelSelector plan line', () => {
  const PLAN_SESSION = {
    status: 'none',
    accessTier: 'full',
    subscription: {
      tierId: 'starter',
      tiers: [
        {
          id: 'starter',
          displayName: 'Starter',
          priceUsd: 8,
          firstPeriodPriceUsd: 2.5,
          dailySessions: 2,
          fiveDaySessions: 6,
          monthlySessions: 50,
          monthlySpendLimitUsd: 40,
          dailyPremiumSessions: 2,
          disclaimers: [],
          current: true,
          upgrade: false,
          downgrade: false,
        },
      ],
      usage: {
        dayUsed: 1.3,
        dayLimit: 2,
        fiveDayUsed: 3,
        fiveDayLimit: 6,
        monthUsed: 11,
        monthLimit: 50,
        dayPremiumUsed: 1,
        dayPremiumLimit: 2,
        dayResetAt: new Date(FIXED_NOW_MS + 3 * 3600_000).toISOString(),
        periodEndsAt: new Date(
          FIXED_NOW_MS + 20 * 24 * 3600_000,
        ).toISOString(),
        monthSpendUsd: 3.21,
        monthSpendLimitUsd: 40,
      },
    },
  } as never

  test('a subscriber sees their plan windows under the catalog', async () => {
    useFreebuffSessionStore.getState().setSession(PLAN_SESSION)
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).toContain('STARTER PLAN')
    expect(frame).toContain('today 1.3 of 2')
    expect(frame).toContain('week 3 of 6')
    expect(frame).toContain('month 11 of 50')
  })

  test('a blocking limit names itself and its reset', async () => {
    useFreebuffSessionStore.getState().setSession({
      ...(PLAN_SESSION as Record<string, unknown>),
      subscription: {
        ...(PLAN_SESSION as { subscription: Record<string, unknown> })
          .subscription,
        blockedBy: 'daily',
      },
    } as never)
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).toContain("today's plan sessions are used")
    expect(frame).toContain('resets in 3h')
  })

  test('a free account sees its own three windows in the same shape', async () => {
    useFreebuffSessionStore.getState().setSession({
      status: 'none',
      accessTier: 'full',
      freeWindows: {
        dayUsed: 1,
        dayLimit: 4,
        weekUsed: 3,
        weekLimit: 14,
        monthUsed: 9,
        monthLimit: 40,
        dayResetAt: new Date(FIXED_NOW_MS + 5 * 3600_000).toISOString(),
        monthResetAt: new Date(FIXED_NOW_MS + 20 * 24 * 3600_000).toISOString(),
      },
    } as never)
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).toContain('FREE · today 1 of 4 · week 3 of 14 · month 9 of 40')
  })

  test('no plan means no plan line', async () => {
    useFreebuffSessionStore
      .getState()
      .setSession({ status: 'none', accessTier: 'full' } as never)
    const frame = (await renderSelector()).captureCharFrame()
    expect(frame).not.toContain('PLAN ·')
  })
})
