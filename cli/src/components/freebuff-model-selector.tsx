import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from './button'
import { FreebuffReferralBanner } from './freebuff-referral-banner'
import {
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffModel,
  getFreebuffModelSupersededBy,
  getFreebuffModelsForAccessTier,
  getRecommendedFreebuffModelId,
  isFreebuffGlmV52ModelId,
  isFreebuffModelAvailable,
  isFreebuffPremiumModelId,
  isSupportedFreebuffModelId,
} from '@codebuff/common/constants/freebuff-models'
import {
  getLimitedModelOffers,
  getRateLimitsByModel,
  getGlmPromo,
  getReferralInfo,
} from '@codebuff/common/types/freebuff-session'

import { startFreebuffSession } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import {
  freebuffModelNavigationDirectionForKey,
  nextFreebuffModelId,
} from '../utils/freebuff-model-navigation'
import { formatSessionUnits } from '../utils/format-session-units'
import {
  formatFreebuffPremiumResetCountdown,
  getFreebuffPremiumResetAt,
} from '../utils/freebuff-premium-reset'
import { isPlainEnterKey } from '../utils/terminal-enter-detection'

import type {
  FreebuffAccessTier,
  FreebuffModelOption,
} from '@codebuff/common/constants/freebuff-models'
import type { FreebuffReferralFocusTarget } from './freebuff-referral-banner'
import type {
  BoxRenderable,
  KeyEvent,
  ScrollBoxRenderable,
} from '@opentui/core'

// The picker opens collapsed to a single recommended hero so a new user can
// start with one Enter press without reading six boxes. The "see all models"
// toggle reveals the rest, grouped into the same product/availability tiers.
//
// Section grouping (expanded view): every model row, including the recommended
// one, keeps its tier so it is obvious which quota it consumes. The premium
// models share one daily session quota while the unlimited ones have none.
// Putting the tier on a section header lets each row drop its redundant
// "Premium"/"Unlimited" chip. The PREMIUM header carries the shared quota
// inline — "N of M used · resets in …" — once any session is spent (turning
// amber when exhausted, the moment its rows grey out). When collapsed there's
// no PREMIUM header, so the parent keeps a below-picker counter for the
// collapsed state (and for the limited tier, which has no premium section).
// Since 2026-08-12 the full-access hero is the PREMIUM DeepSeek V4 Pro 08/13
// again (DEFAULT_FREEBUFF_MODEL_ID), so it draws on that same pool and flips to
// the unlimited Flash once the pool empties — the hero must always be joinable.
// The limited tier's hero stays the always-available Flash. UNLIMITED needs no
// annotation. Empty sections are filtered so a model set with no premium (or no
// unlimited) entries doesn't render an orphan header.
//
// `label` may be empty: limited-tier users only see the constrained model set,
// so the "LIMITED" header would just leak the internal tier name without
// organizing anything. Renderer treats an empty label as "no header row".
type Section = {
  key: 'premium' | 'unlimited' | 'limited' | 'offer'
  label: string
  models: readonly FreebuffModelOption[]
}

// Sentinel id for the expand/collapse toggle so it can ride the same
// keyboard-navigation list as the model rows (Tab/arrow to it, Enter to fire).
const TOGGLE_ID = '__freebuff_toggle__'

// There used to be a right-aligned "Press Enter ↵" cue on the focused row, with
// its width reserved in the line-1 budget below. Both are gone: the cue was
// redundant next to the green focus border, and its reserved gutter widened
// every card by ~17 columns of dead space.

/**
 * Pre-chat model picker (session 'none'): user hasn't started a session yet.
 * Picking a model is their explicit commitment to enter — this triggers the
 * POST, which admits them straight to an active session. Opens collapsed to
 * the recommended hero; Enter starts immediately.
 *
 * Keyboard navigation: Tab / arrow keys move the green highlight; Enter (or
 * Space) commits the focused row — or, on the toggle, expands/collapses the
 * list. Mouse click commits in one step.
 *
 * Layout: the recommended model renders as a titled "RECOMMENDED" card. When
 * expanded, every full-access row is grouped into PREMIUM / UNLIMITED sections
 * so the recommended row's tier is explicit without a per-row chip; the shared
 * premium-session quota rides the PREMIUM header. Names align in a column
 * so taglines line up across rows, and the secondary details (warning /
 * deployment hours) always sit on their own centered line under the name —
 * keeping a row with a warning from stretching into one very long line. On
 * terminals too narrow for the name column, line 1 compacts to "name · tagline".
 *
 * On short terminals the parent passes `maxHeight`: the model rows and the
 * referral/GLM controls live in one scrollbox capped at that many rows. A
 * scrollbar appears when the whole menu doesn't fit, and Tab/arrow navigation
 * keeps the focused control scrolled into view.
 */
interface FreebuffModelSelectorProps {
  /** Max vertical rows the picker may occupy. When the rendered rows exceed
   *  this, the list scrolls (scrollbar shown, focused row kept in view);
   *  otherwise the scrollbox shrinks to fit and no scrollbar appears. */
  maxHeight: number
  /** Notifies the parent whenever the picker expands/collapses. The landing
   *  screen uses it to promote the wordmark to the full ASCII logo while the
   *  picker is collapsed (the freed rows make room). */
  onExpandedChange?: (expanded: boolean) => void
  /** Rendered between the expand/collapse toggle and the referral banner. The
   *  landing screen passes its session counter here so the quota sits with the
   *  models it describes, leaving the referral pitch and its copy control
   *  adjacent as one unit. Lives inside the scrollbox, so it scrolls with the
   *  rest of the content rather than being pinned below it. */
  belowToggle?: React.ReactNode
}

/** The rows the grid shows a tier. GLM 5.2 is a referral reward, not a freely-pickable
 *  model, so it reaches the user through FreebuffReferralBanner instead. */
function gridModels(
  accessTier: FreebuffAccessTier,
): readonly FreebuffModelOption[] {
  return getFreebuffModelsForAccessTier(accessTier).filter(
    (m) => !isFreebuffGlmV52ModelId(m.id),
  )
}

/** Every model id this screen can offer a tier: the grid, plus the banner's earned GLM
 *  action. Exported so the offer→gate invariant test reads the real set rather than a
 *  copy of it.
 *
 *  GLM is offered on BOTH tiers. It used to be full-access only, which was correct while
 *  GLM was a referral reward and referrals paid limited users in something else. Bounties
 *  changed that: a bounty grant is minted redeemable at limited access so the reward is
 *  worth the same in every region. The balance is what gates the row — the banner only
 *  renders the action when the server reports sessions left — and the tier never was. */
export function freebuffCliOfferedModelIds(
  accessTier: FreebuffAccessTier,
): readonly string[] {
  return [...gridModels(accessTier).map((m) => m.id), FREEBUFF_GLM_V52_MODEL_ID]
}

export const FreebuffModelSelector: React.FC<FreebuffModelSelectorProps> = ({
  maxHeight,
  onExpandedChange,
  belowToggle,
}) => {
  const theme = useTheme()
  // contentMaxWidth (not terminalWidth) is the real budget — the parent
  // landing screen wraps this picker in a `maxWidth: contentMaxWidth`
  // box (capped at 80 cols), so a wide terminal doesn't actually let us
  // sprawl the buttons across it.
  const { contentMaxWidth } = useTerminalDimensions()
  const selectedModel = useFreebuffModelStore((s) => s.selectedModel)
  const setSelectedModel = useFreebuffModelStore((s) => s.setSelectedModel)
  const session = useFreebuffSessionStore((s) => s.session)
  const accessTier =
    (session && 'accessTier' in session ? session.accessTier : undefined) ??
    'full'
  const now = useNow(60_000)
  const deploymentAvailabilityLabel = useMemo(
    () => getFreebuffDeploymentAvailabilityLabel(new Date(now)),
    [now],
  )
  const [pending, setPending] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const availableModels = useMemo(() => gridModels(accessTier), [accessTier])
  // Capacity-limited models the SERVER decided to offer on this response. The
  // client has no catalog of its own for these on purpose: when the wave's pool
  // empties (or the offer is switched off) the payload stops arriving and every
  // derived value below collapses to empty, so the picker renders exactly what
  // it rendered before the offer existed — no stale row, no greyed-out tease.
  //
  // An unknown model id is dropped rather than rendered from the wire payload:
  // display name and data-use warning must come from the shared catalog, so a
  // server that advertises a model this build has never heard of is a no-op
  // instead of a half-labelled row.
  const offers = useMemo(
    () =>
      getLimitedModelOffers(session).filter((offer) =>
        isSupportedFreebuffModelId(offer.model),
      ),
    [session],
  )
  const offerModels = useMemo(
    () => offers.map((offer) => getFreebuffModel(offer.model)),
    [offers],
  )
  const offerByModelId = useMemo(
    () => new Map(offers.map((offer) => [offer.model, offer])),
    [offers],
  )
  // No queued state any more: there's never a model the user is "already in"
  // the queue for, so re-picking is always meaningful.
  const committedModelId: string | null = null
  const rateLimitsByModel = getRateLimitsByModel(session)
  const referral = getReferralInfo(session)
  // Present only while a promo runs; absent renders the banner exactly as it
  // rendered before promos existed.
  const glmPromo = getGlmPromo(session)

  // Premium-session quota, surfaced on the PREMIUM header itself: "N of M used
  // · resets in …". All premium models share one pool; the server replicates
  // the same snapshot under every model id, so any entry has the right count.
  // The count shows from the start — even at "0 of M" — so full-access users
  // can see the daily pool and reset cadence before they spend anything. The
  // limit is the server-sent one (base + streak bonus, falling back to the
  // static base before any snapshot arrives) so the label, the amber
  // exhausted cue, and isJoinable below can never disagree. Exhaustion is
  // also the moment the recommended hero flips to the unlimited fallback (when
  // the recommendation is premium) — the hero must always be joinable. (The PREMIUM
  // section only renders for the full-access tier, so this is scoped to it.)
  const sharedRateLimit = rateLimitsByModel
    ? Object.values(rateLimitsByModel)[0]
    : undefined
  const premiumUsed = sharedRateLimit?.recentCount ?? 0
  const premiumLimit = sharedRateLimit?.limit ?? FREEBUFF_PREMIUM_SESSION_LIMIT
  const premiumExhausted = premiumUsed >= premiumLimit
  // The pool resets daily on a Pacific-day boundary regardless of usage, so the
  // countdown is meaningful even at zero used — getFreebuffPremiumResetAt falls
  // back to the next day boundary when the server hasn't sent a resetAt yet.
  const premiumResetCountdown = formatFreebuffPremiumResetCountdown(
    getFreebuffPremiumResetAt({ rateLimitsByModel, nowMs: now }),
    now,
  )

  const recommendedModel = useMemo(() => {
    const id = getRecommendedFreebuffModelId(accessTier, { premiumExhausted })
    return availableModels.find((m) => m.id === id) ?? availableModels[0]!
  }, [accessTier, availableModels, premiumExhausted])

  // "A better model exists" footnote for a row. The CLI has no in-row button to
  // switch with, so it shows the notice only — the replacement is always
  // reachable as a row in this same picker (and is usually the RECOMMENDED hero
  // one Enter away), which is what getFreebuffModelSupersededBy guarantees by
  // resolving against the models actually on screen.
  const supersededNoticeFor = useCallback(
    (model: FreebuffModelOption): string | undefined =>
      // Only on the row the user is actually on — the nudge is about THEIR
      // pick, and the list ordering already steers everyone else to the
      // replacement. Gated here rather than at the render so the width math and
      // the height estimate below stay in agreement with what is drawn.
      model.id === selectedModel
        ? getFreebuffModelSupersededBy(
            model.id,
            availableModels.map((m) => m.id),
          )?.notice
        : undefined,
    [availableModels, selectedModel],
  )
  const otherModels = useMemo(
    () => availableModels.filter((m) => m.id !== recommendedModel.id),
    [availableModels, recommendedModel],
  )
  // Only worth collapsing when the toggle actually hides something. With a
  // single "other" model (limited tier) we just show both — a "see 1 more
  // model" toggle is noise.
  const canCollapse = otherModels.length >= 2

  const isJoinable = useCallback(
    (modelId: string) => {
      if (!isFreebuffModelAvailable(modelId, new Date(now))) return false
      // An offer row is on screen only while the shared pool has capacity, so
      // what's left to check is the caller's own daily ceiling. It travels on
      // the offer payload rather than in `rateLimitsByModel`, which the server
      // deliberately keeps free of these models so the 30s poll doesn't pay for
      // a quota nobody is using.
      const offer = offerByModelId.get(modelId)
      if (offer) return offer.userRemaining > 0
      const rateLimit = rateLimitsByModel?.[modelId]
      return !rateLimit || rateLimit.recentCount < rateLimit.limit
    },
    [now, offerByModelId, rateLimitsByModel],
  )

  // Default collapsed only on the landing screen and only when the saved/active
  // selection IS the recommended model — a returning user whose preference is a
  // different model gets the expanded list so their pick is visible and focused.
  // STARTABLE, not merely different: the effect below is about to replace an
  // unstartable pick with the recommendation, and expanding to show a spent row
  // "focused" buries the hero under rows the user cannot press — which is what
  // a spent premium pool did once the default became premium (2026-08-12).
  const isLanding = session?.status === 'none' || !session
  const [expanded, setExpanded] = useState(
    () =>
      !canCollapse ||
      !isLanding ||
      (selectedModel !== recommendedModel.id && isJoinable(selectedModel)),
  )
  // Limited mode has no labeled tier section, so moving its recommendation
  // inside that section would only move the existing inter-card spacing above
  // the entire list. Keep its original standalone recommendation; full-access
  // expanded views put every row beneath a quota-bearing section header.
  const showStandaloneRecommended = !expanded || accessTier === 'limited'
  // The session snapshot arrives asynchronously. If it changes the picker
  // from full access (collapsible) to limited access (only two rows), force
  // the list open before notifying the parent; otherwise the toggle disappears
  // while the second limited model remains hidden.
  //
  // Mirror the settled state up to the landing screen (collapsed → it promotes
  // the wordmark to the full ASCII logo). useLayoutEffect keeps both corrections
  // ahead of paint.
  useLayoutEffect(() => {
    if (!canCollapse && !expanded) {
      setExpanded(true)
      return
    }
    onExpandedChange?.(expanded)
  }, [canCollapse, expanded, onExpandedChange])

  // Keyboard cursor — separate from the actually-selected model so that
  // Tab/arrow navigation can preview without committing. Starts on the user's
  // saved/active pick (the recommended hero for a new user, since that's the
  // default selection; their own model when expanded for a returning user).
  const [focusedId, setFocusedId] = useState<string>(() => selectedModel)

  // The referral banner contributes its GLM/copy actions to the selector's
  // navigation order. Keeping them local avoids a global focus bridge now that
  // the banner renders inside this selector.
  const [extraTargets, setExtraTargets] = useState<
    FreebuffReferralFocusTarget[]
  >([])
  const extraTargetIds = useMemo(
    () => extraTargets.map((t) => t.id),
    [extraTargets],
  )
  const contentRef = useRef<BoxRenderable | null>(null)
  const [measuredContentHeight, setMeasuredContentHeight] = useState<
    number | null
  >(null)
  const syncContentHeight = useCallback(() => {
    const nextHeight = contentRef.current?.height
    if (!nextHeight) return
    setMeasuredContentHeight((current) =>
      current === nextHeight ? current : nextHeight,
    )
  }, [])
  // The standing catalog's tier sections. Expanded-only; the offer section
  // below is added on top and is visible in both states.
  const catalogSections = useMemo(() => {
    if (!expanded) return [] as readonly Section[]
    if (accessTier === 'limited') {
      return [
        { key: 'limited', label: '', models: otherModels },
      ] satisfies readonly Section[]
    }
    return (
      [
        {
          key: 'premium',
          label: 'PREMIUM',
          models: availableModels.filter((m) => isFreebuffPremiumModelId(m.id)),
        },
        {
          key: 'unlimited',
          label: 'UNLIMITED',
          models: availableModels.filter(
            (m) => !isFreebuffPremiumModelId(m.id),
          ),
        },
      ] satisfies readonly Section[]
    ).filter((section) => section.models.length > 0)
  }, [expanded, accessTier, availableModels, otherModels])

  // Every section that gets drawn, in draw order. THE single source for the
  // render, the navigation order and the height estimate — those three must
  // agree on which sections exist or the focused-row auto-scroll desyncs, so
  // they all read this rather than each rebuilding the list.
  //
  // The offer section leads and is drawn in BOTH the collapsed and expanded
  // views, unlike every other section. A time-boxed frontier model that only a
  // few dozen people get is the one row worth spending a collapsed-view line
  // on — hiding it behind "see all models" would mean most users never learn
  // the offer happened. It still sits after the recommended hero (drawn
  // separately, above), so the collapsed view reads "recommended first, special
  // second".
  const renderedSections = useMemo(
    () =>
      offerModels.length > 0
        ? [
            {
              key: 'offer' as const,
              label: 'LIMITED TRIAL',
              models: offerModels,
            },
            ...catalogSections,
          ]
        : catalogSections,
    [offerModels, catalogSections],
  )

  // Model rows in render order: a standalone recommendation in collapsed and
  // limited views, followed by all models belonging to rendered sections.
  const renderedModelIds = useMemo(
    () => [
      ...(showStandaloneRecommended ? [recommendedModel.id] : []),
      ...renderedSections.flatMap((section) => section.models.map((m) => m.id)),
    ],
    [recommendedModel, renderedSections, showStandaloneRecommended],
  )
  // Keyboard-navigable ids: the model rows, then the toggle, then any focus
  // targets the referral banner registered (so arrowing down past "see all
  // models" reaches its buttons; nextFreebuffModelId wraps back to the top).
  const navIds = useMemo(
    () => [
      ...renderedModelIds,
      ...(canCollapse ? [TOGGLE_ID] : []),
      ...extraTargetIds,
    ],
    [canCollapse, renderedModelIds, extraTargetIds],
  )

  // Keep focus valid as the list expands/collapses or the selection changes
  // server-side. An explicit, still-valid focus (e.g. just set by the toggle)
  // is preserved; only an out-of-range focus snaps back to the selection.
  useEffect(() => {
    setFocusedId((curr) =>
      navIds.includes(curr)
        ? curr
        : navIds.includes(selectedModel)
          ? selectedModel
          : recommendedModel.id,
    )
  }, [navIds, recommendedModel.id, selectedModel])

  useEffect(() => {
    // Landing-screen safety net: the selection has to be one the user can
    // actually start, or Enter POSTs a model the server rejects — or, worse,
    // `pick` refuses it here and Enter does nothing at all. Two rules, because
    // GLM is not an ordinary row:
    //
    //  - GLM 5.2 is judged by its referral BALANCE and nothing else. It is
    //    selectable from the banner but is not in FREEBUFF_MODELS, so it never
    //    reaches `renderedModelIds`, and its quota is not in this surface's
    //    snapshot, so `isJoinable` cannot see it either. With
    //    `accessTier === 'full'` in here instead, a limited-tier user who
    //    pressed "Use GLM 5.2" had their pick judged invalid one render later
    //    and silently swapped for the recommendation — the bounty session they
    //    had earned was spendable on the server and unreachable from this
    //    screen.
    //  - every other model must be on screen AND startable. Rendered is not
    //    enough: a spent premium row stays on screen, greyed, and `pick`
    //    refuses it. That was unreachable while the default was unlimited;
    //    since it became premium (2026-08-12) it is the ordinary state of a
    //    returning user who has spent their pool. isJoinable runs the
    //    deployment-hours check too, so closing hours are covered here.
    //
    // In-memory only — `setSelectedModel` doesn't persist, so the user's saved
    // preference survives for their next launch.
    const selectionIsStartable = isFreebuffGlmV52ModelId(selectedModel)
      ? (referral?.weeklySessionsRemaining ?? 0) > 0
      : renderedModelIds.includes(selectedModel) && isJoinable(selectedModel)
    if (isLanding && !selectionIsStartable) {
      setSelectedModel(recommendedModel.id)
      // The cursor moves too: the focus effect above only rescues an
      // out-of-RANGE focus, and the row we just refused is still in range.
      setFocusedId(recommendedModel.id)
    }
  }, [
    referral?.weeklySessionsRemaining,
    renderedModelIds,
    isLanding,
    isJoinable,
    recommendedModel.id,
    selectedModel,
    setSelectedModel,
  ])

  const BUTTON_CHROME = 4 // 2 border + 2 padding
  const NAME_GAP = 2 // spaces between name column and details column

  // Rows are two lines: line 1 is the identity (name + tagline), line 2 carries
  // the secondary details (AI-training warning · deployment hours), centered.
  // The warning ALWAYS gets its own line rather than being appended to line 1 —
  // the recommended hero carries the training notice, and inlining it made that
  // row one very long line that dominated the landing screen.
  //
  // Line 1 is normally two columns: a fixed name column (padded to the longest
  // displayName across all rows) followed by the tagline, so taglines align
  // down the list. On terminals too narrow for that it falls back to a compact
  // "name · tagline". Computed across ALL models (not just the expanded ones)
  // so the recommended hero and the revealed rows share one width and nothing
  // reflows on toggle.
  const { compactNames, buttonOuterWidth, buttonInnerWidth, nameColumnWidth } =
    useMemo(() => {
      // Every row that can appear, offer rows included: their row is visible
      // while collapsed, so leaving them out would let the card jump width the
      // moment an offer arrives. The offer's own counts ride its section header
      // (like PREMIUM's quota), so only name and tagline enter the column math.
      const widthModels = [...availableModels, ...offerModels]
      const maxNameLen = Math.max(
        ...widthModels.map((m) => m.displayName.length),
      )

      const joinedLen = (parts: number[]): number =>
        parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 3 // " · "

      const detailsParts = (model: FreebuffModelOption): number[] => {
        const parts: number[] = []
        if (model.warning) parts.push(model.warning.length)
        if (model.availability === 'deployment_hours') {
          parts.push(deploymentAvailabilityLabel.length)
        }
        return parts
      }

      // Line 3, when a better model exists. Its own line: the notice is a full
      // sentence, so appending it to line 2 would stretch the card past any
      // reasonable terminal width.
      const noticeLineLen = (m: FreebuffModelOption) =>
        supersededNoticeFor(m)?.length ?? 0

      // Compact image indicator (" · Images", 9 chars) appended to the tagline on
      // line 1 so it never occupies its own line. Only NATIVELY multimodal models
      // carry it — text-only ones read an image as a vision-model description
      // substituted server-side, which is a real fallback but not a capability
      // worth advertising as a per-row badge.
      const multimodalSuffixLen = (m: FreebuffModelOption) =>
        m.multimodal ? 9 : 0
      // Same treatment for the " · Reasoning: high" effort suffix.
      const reasoningSuffixLen = (m: FreebuffModelOption) =>
        m.reasoningEffort ? 14 + m.reasoningEffort.length : 0
      // Same treatment for the " · NEW" badge (6 chars).
      const newSuffixLen = 6

      // Line 1, in each mode.
      const columnLabelLen = (m: FreebuffModelOption) =>
        2 /* indicator + space */ +
        maxNameLen +
        NAME_GAP +
        m.tagline.length +
        reasoningSuffixLen(m) +
        multimodalSuffixLen(m) +
        (m.isNew ? newSuffixLen : 0)
      const compactLabelLen = (m: FreebuffModelOption) =>
        2 +
        m.displayName.length +
        3 /* " · " */ +
        m.tagline.length +
        reasoningSuffixLen(m) +
        multimodalSuffixLen(m) +
        (m.isNew ? newSuffixLen : 0)

      // Line 2, or 0 for a row with neither warning nor hours. Centered in the
      // card rather than indented under line 1's details column — the notice is
      // a footnote about the row as a whole, and right-flushing it against the
      // border (which the old indent did on the widest row) read as ragged.
      // Centering means it only needs its own length to fit, so it no longer
      // stretches the card.
      const detailsLineLen = (m: FreebuffModelOption) =>
        joinedLen(detailsParts(m))

      // Cards are exactly as wide as their widest line. Nothing is reserved
      // beyond that — the removed "Press Enter ↵" gutter used to pad every card
      // out to the hero's line plus 17 columns of empty space.
      const innerWidth = (labelLen: (m: FreebuffModelOption) => number) =>
        Math.max(
          ...widthModels.map((m) =>
            Math.max(labelLen(m), detailsLineLen(m), noticeLineLen(m)),
          ),
        )

      const columnInner = innerWidth(columnLabelLen)
      const columnOuter = columnInner + BUTTON_CHROME
      if (columnOuter <= contentMaxWidth) {
        return {
          compactNames: false,
          buttonOuterWidth: columnOuter,
          buttonInnerWidth: columnInner,
          nameColumnWidth: maxNameLen,
        }
      }

      // Narrow: drop the name padding so line 1 reads "name · tagline".
      const compactOuter = Math.min(
        innerWidth(compactLabelLen) + BUTTON_CHROME,
        contentMaxWidth,
      )
      return {
        compactNames: true,
        buttonOuterWidth: compactOuter,
        buttonInnerWidth: compactOuter - BUTTON_CHROME,
        nameColumnWidth: maxNameLen,
      }
    }, [
      availableModels,
      offerModels,
      contentMaxWidth,
      deploymentAvailabilityLabel,
      supersededNoticeFor,
    ])

  // A row spends a second line whenever it has details to put there — no longer
  // conditional on the terminal width, since the warning never inlines.
  const rowHasDetailsLine = useCallback(
    (m: FreebuffModelOption) =>
      !!m.warning || m.availability === 'deployment_hours',
    [],
  )

  // Initial model-only height estimate. The content wrapper below reports its
  // actual laid-out height, including wrapped referral copy and responsive
  // action rows; this estimate only avoids a zero-height first frame.
  // Headers add 1 row; sections after the first add 1 row of marginTop; the
  // toggle adds its marginTop + 1.
  const SECTION_GAP = 1
  const TOGGLE_MARGIN = 1
  const estimatedModelHeight = useMemo(() => {
    let y = 0
    const rowHeight = (m: FreebuffModelOption) =>
      2 + (rowHasDetailsLine(m) ? 2 : 1) + (supersededNoticeFor(m) ? 1 : 0)
    if (showStandaloneRecommended) {
      y += rowHeight(recommendedModel)
    }
    renderedSections.forEach((section) => {
      y += SECTION_GAP
      if (section.label) y += 1
      section.models.forEach((m) => {
        y += rowHeight(m)
      })
    })
    if (canCollapse) {
      y += TOGGLE_MARGIN
      y += 1
    }
    return y
  }, [
    renderedSections,
    rowHasDetailsLine,
    recommendedModel,
    canCollapse,
    showStandaloneRecommended,
    supersededNoticeFor,
  ])

  // When a referral exists, start at the parent's full allowance until the
  // wrapper reports its intrinsic height. The model estimate remains a lower
  // bound after measurement: expansion and an asynchronously arriving access
  // tier can grow the list before OpenTUI reports the wrapper's new height, and
  // reusing the smaller collapsed measurement would clip the newly added rows.
  const contentHeight = Math.max(
    estimatedModelHeight,
    measuredContentHeight ?? (referral ? maxHeight : 0),
  )

  const needsScroll = contentHeight > maxHeight
  const scrollViewportHeight = Math.max(1, Math.min(contentHeight, maxHeight))
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  // Keep the keyboard-focused element inside the viewport as the user
  // Tabs/arrows through a list taller than the available rows. Child ids let
  // OpenTUI use the real post-wrap geometry instead of a second hand-maintained
  // row model. Reset a stale offset when a resize makes everything fit.
  useLayoutEffect(() => {
    const sb = scrollRef.current
    if (!sb) return
    if (!needsScroll) {
      sb.scrollTop = 0
      return
    }
    sb.scrollChildIntoView(focusedId)
    // The final referral action has explanatory/footer content after it. When
    // it is focused, reveal the real bottom of the measured content as well as
    // the button itself so the card does not look cut off.
    if (focusedId === extraTargetIds.at(-1)) {
      sb.scrollTop = Math.max(0, sb.scrollHeight - sb.viewport.height)
    }
  }, [focusedId, contentHeight, needsScroll, extraTargetIds])

  const pick = useCallback(
    (modelId: string) => {
      if (pending) return
      if (modelId === committedModelId) return
      if (!isJoinable(modelId)) return
      setPending(modelId)
      startFreebuffSession(modelId).finally(() => setPending(null))
    },
    [pending, committedModelId, isJoinable],
  )

  const toggleExpanded = useCallback(() => {
    // Expanding is informational: keep Enter bound to the recommendation
    // instead of silently moving focus to a different model. Collapsing
    // returns to the same recommendation.
    setFocusedId(recommendedModel.id)
    setExpanded((prev) => !prev)
  }, [recommendedModel.id])

  // Tab / Shift+Tab and arrow keys move the focus highlight only; Enter or
  // Space commits the focused row (or fires the toggle). Two-step navigation
  // lets the user preview the highlight before committing.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (pending) return
        const name = key.name ?? ''
        const direction = freebuffModelNavigationDirectionForKey(key)
        // Use the shared Enter detector so the keypad Enter and the niche
        // Linux terminals that send \n (linefeed) for Enter also commit; a
        // raw name === 'return' check silently ignores those, which looks
        // like a frozen menu (arrows move the highlight, Enter does nothing).
        const isCommit = isPlainEnterKey(key) || name === 'space'
        if (isCommit) {
          if (focusedId === TOGGLE_ID) {
            key.preventDefault?.()
            key.stopPropagation?.()
            toggleExpanded()
            return
          }
          // A referral-banner button (copy invite link / use GLM) is focused —
          // fire its registered action instead of joining a queue.
          const extraTarget = extraTargets.find((t) => t.id === focusedId)
          if (extraTarget) {
            key.preventDefault?.()
            key.stopPropagation?.()
            extraTarget.activate()
            return
          }
          if (isJoinable(focusedId) && focusedId !== committedModelId) {
            key.preventDefault?.()
            key.stopPropagation?.()
            pick(focusedId)
          }
          return
        }
        if (!direction) return
        const targetId = nextFreebuffModelId({
          modelIds: navIds,
          focusedId,
          direction,
        })
        if (targetId) {
          key.preventDefault?.()
          key.stopPropagation?.()
          setFocusedId(targetId)
        }
      },
      [
        pending,
        pick,
        toggleExpanded,
        focusedId,
        committedModelId,
        isJoinable,
        navIds,
        extraTargets,
      ],
    ),
  )

  const renderModelButton = (
    model: FreebuffModelOption,
    options: { recommended?: boolean } = {},
  ) => {
    // Single visual state: the focused row IS the highlight. The user's
    // saved/committed pick is not shown separately — it just sets where
    // focus lands when the picker opens. Pressing Enter on the focused
    // row commits it.
    const { recommended = false } = options
    const isHovered = hoveredId === model.id
    const isFocused = focusedId === model.id
    const canJoin = isJoinable(model.id)
    // Clickable whenever picking would actually do something — i.e.
    // anything except re-picking the queue we're already in.
    const interactable = !pending && canJoin && model.id !== committedModelId

    // Focused row: green border + arrow indicator + bold name. The name
    // itself stays the normal foreground color so it doesn't shout — the
    // border and arrow do the highlighting. Off-focus rows are default.
    const indicator = isFocused ? '›' : ' '
    const fgColor = canJoin ? theme.foreground : theme.muted
    const mutedColor = theme.muted
    const warningColor = theme.secondary

    // Focused row gets the bright primary border (and arrow). Every other row —
    // including the recommended card when the cursor has moved elsewhere — stays
    // quiet (gray border, brightening only on hover) so it never competes with
    // the user's current selection. The recommended card still reads as special
    // via its "RECOMMENDED" border title, which the border color carries.
    const borderColor = isFocused
      ? theme.primary
      : isHovered
        ? theme.foreground
        : theme.border

    // Deployment-hours rows show "until 5pm PT" while open and "opens 9am ET"
    // while closed (the label flips inside getFreebuffDeploymentAvailabilityLabel),
    // so the same string carries both the in-hours and out-of-hours signals
    // without a separate "Closed" chip. Greyed-out fgColor handles the rest.
    const hasHours = model.availability === 'deployment_hours'
    const hasWarning = !!model.warning

    // Line 2 (warning · hours) is centered in the card. Spaces render verbatim,
    // so center by hand-padding the left. Clamped at 0 for the narrow mode,
    // where buttonInnerWidth is capped by contentMaxWidth and the line may be
    // wider than the card.
    const detailsLen =
      (hasWarning ? model.warning!.length : 0) +
      (hasWarning && hasHours ? 3 : 0) +
      (hasHours ? deploymentAvailabilityLabel.length : 0)
    const detailsPad = Math.max(
      0,
      Math.floor((buttonInnerWidth - detailsLen) / 2),
    )

    const supersededNotice = supersededNoticeFor(model)
    const supersededPad = Math.max(
      0,
      Math.floor((buttonInnerWidth - (supersededNotice?.length ?? 0)) / 2),
    )

    // Spaces inside <span>s render verbatim, so we hand-pad the name to align
    // taglines into a column. nameColumnWidth is the longest name across all
    // rows, so the diff is >= 0; +NAME_GAP guarantees breathing room even on
    // the widest row.
    const namePadding = ' '.repeat(
      nameColumnWidth - model.displayName.length + NAME_GAP,
    )

    // Only natively multimodal models advertise image input. Text-only models
    // still accept a pasted image (it is substituted server-side as a
    // vision-model description), but badging every row "Images" made the label
    // meaningless — and it is what stretched line 1 on rows that can't actually
    // see pixels.
    const imagesSuffix = model.multimodal ? ' · Images' : ''

    // The effort the server runs this model at (the same catalog field the
    // completions layer sends) — see FreebuffModelOption.reasoningEffort.
    const reasoningSuffix = model.reasoningEffort
      ? ` · Reasoning: ${model.reasoningEffort}`
      : ''

    return (
      <Button
        key={model.id}
        id={model.id}
        title={recommended ? ' RECOMMENDED ' : undefined}
        titleAlignment={recommended ? 'left' : undefined}
        onClick={() => {
          setFocusedId(model.id)
          if (canJoin) pick(model.id)
        }}
        onMouseOver={() => interactable && setHoveredId(model.id)}
        onMouseOut={() =>
          setHoveredId((curr) => (curr === model.id ? null : curr))
        }
        style={{
          borderStyle: 'single',
          borderColor,
          paddingLeft: 1,
          paddingRight: 1,
          width: buttonOuterWidth,
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        <text>
          <span fg={fgColor}>{indicator} </span>
          <span
            fg={fgColor}
            attributes={isFocused ? TextAttributes.BOLD : TextAttributes.NONE}
          >
            {model.displayName}
          </span>
          {compactNames ? (
            <span fg={mutedColor}>
              {' · ' + model.tagline + reasoningSuffix + imagesSuffix}
            </span>
          ) : (
            <span fg={mutedColor}>
              {namePadding + model.tagline + reasoningSuffix + imagesSuffix}
            </span>
          )}
          {model.isNew && (
            <span fg={theme.primary} attributes={TextAttributes.BOLD}>
              {' · NEW'}
            </span>
          )}
        </text>
        {(hasWarning || hasHours) && (
          <text>
            <span>{' '.repeat(detailsPad)}</span>
            {hasWarning && <span fg={warningColor}>{model.warning}</span>}
            {hasWarning && hasHours && <span fg={mutedColor}> · </span>}
            {hasHours && (
              <span fg={mutedColor}>{deploymentAvailabilityLabel}</span>
            )}
          </text>
        )}
        {supersededNotice && (
          <text>
            <span>{' '.repeat(supersededPad)}</span>
            <span fg={mutedColor}>{supersededNotice}</span>
          </text>
        )}
      </Button>
    )
  }

  // Scarcity, on the LIMITED TRIAL header rather than on the row — same
  // treatment the shared premium quota gets, so counts live in one predictable
  // place and the rows stay narrow. Two facts, in the order they matter: how
  // much of the wave is left for everyone, and (only once the user has spent
  // theirs) when they personally get another. `offers` is homogeneous — one
  // pool, one per-user ceiling — so the first entry speaks for all of them.
  const offerSummary = offers[0]
  const offerUserExhausted = !!offerSummary && offerSummary.userRemaining <= 0
  const offerUserResetAt = offerSummary
    ? new Date(offerSummary.userResetAt)
    : null
  const offerUserResetCountdown =
    offerUserResetAt && Number.isFinite(offerUserResetAt.getTime())
      ? formatFreebuffPremiumResetCountdown(offerUserResetAt, now)
      : null

  const sectionsContent = renderedSections.map((section) => (
    <box
      key={section.key}
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
        marginTop: SECTION_GAP,
      }}
    >
      {/* wrapMode 'none' pins headers to one row — the offset math above
          assumes exactly 1 row per header, so a wrap would desync the
          focused-row auto-scroll. */}
      {section.label && (
        <text style={{ fg: theme.muted, wrapMode: 'none' }}>
          {section.label}
          {section.key === 'premium' && (
            <span fg={premiumExhausted ? theme.secondary : theme.muted}>
              {' '}
              · {formatSessionUnits(premiumUsed)} of {premiumLimit} used
            </span>
          )}
          {section.key === 'premium' && premiumResetCountdown && (
            <span fg={theme.muted}> · resets in {premiumResetCountdown}</span>
          )}
          {section.key === 'offer' && offerSummary && (
            <span fg={theme.primary}>
              {' '}
              · {offerSummary.remaining} of {offerSummary.total} sessions left
            </span>
          )}
          {section.key === 'offer' && offerUserExhausted && (
            <span fg={theme.secondary}>
              {' '}
              · you've used yours
              {offerUserResetCountdown
                ? `, resets in ${offerUserResetCountdown}`
                : ''}
            </span>
          )}
        </text>
      )}
      {section.models.map((m) =>
        renderModelButton(m, { recommended: m.id === recommendedModel.id }),
      )}
    </box>
  ))

  // Expand/collapse affordance. Collapsed: "see all N models" invites the user
  // to browse past the recommended pick. Expanded: a quiet way back to the
  // single-card view.
  const toggleFocused = focusedId === TOGGLE_ID
  const toggleHovered = hoveredId === TOGGLE_ID
  // Same treatment as the referral banner's inline copy control, the other
  // borderless action on this screen: white at rest so it reads as a control
  // rather than body copy, accent green once focused or hovered.
  const toggleColor =
    toggleFocused || toggleHovered ? theme.primary : theme.foreground
  const toggleLabel = expanded
    ? '↑  Show fewer'
    : `↓  See all ${availableModels.length} models`
  const toggleContent = canCollapse ? (
    <Button
      id={TOGGLE_ID}
      onClick={toggleExpanded}
      onMouseOver={() => setHoveredId(TOGGLE_ID)}
      onMouseOut={() =>
        setHoveredId((curr) => (curr === TOGGLE_ID ? null : curr))
      }
      style={{ marginTop: TOGGLE_MARGIN }}
    >
      <text style={{ wrapMode: 'none' }}>
        <span
          fg={toggleColor}
          attributes={toggleFocused ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          {toggleLabel}
        </span>
      </text>
    </Button>
  ) : null

  // Scrollbox clamped to the rows the parent can spare. When everything fits
  // it shrinks to the content height and no scrollbar shows, so tall
  // terminals look exactly like a plain column.
  return (
    <scrollbox
      ref={scrollRef}
      scrollX={false}
      scrollbarOptions={{ visible: false }}
      verticalScrollbarOptions={{
        visible: needsScroll,
        trackOptions: { width: 1 },
      }}
      style={{
        height: scrollViewportHeight,
        // A scrollbox stretches to fill its parent, which would left-align
        // the picker; pin it to the button column width (plus a gutter for
        // the scrollbar) so the landing block stays content-sized and the
        // parent can center it as it did before this was a scrollbox.
        width: buttonOuterWidth + (needsScroll ? 1 : 0),
        flexShrink: 0,
        rootOptions: {
          flexDirection: 'row',
          backgroundColor: 'transparent',
        },
        wrapperOptions: {
          border: false,
          backgroundColor: 'transparent',
          flexDirection: 'column',
        },
        contentOptions: {
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
          backgroundColor: 'transparent',
        },
      }}
    >
      <box
        ref={contentRef}
        onSizeChange={syncContentHeight}
        style={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0,
          width: buttonOuterWidth,
          flexShrink: 0,
        }}
      >
        {showStandaloneRecommended &&
          renderModelButton(recommendedModel, { recommended: true })}
        {sectionsContent}
        {toggleContent}
        {belowToggle}
        {referral && (
          <FreebuffReferralBanner
            width={buttonOuterWidth}
            referral={referral}
            glmPromo={glmPromo}
            accessTier={accessTier}
            focusedId={focusedId}
            onFocusTargetsChange={setExtraTargets}
          />
        )}
      </box>
    </scrollbox>
  )
}
