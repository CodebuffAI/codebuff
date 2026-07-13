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
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffModelsForAccessTier,
  getRecommendedFreebuffModelId,
  isFreebuffGlmV52ModelId,
  isFreebuffModelAvailable,
  isFreebuffPremiumModelId,
} from '@codebuff/common/constants/freebuff-models'
import {
  getRateLimitsByModel,
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

import type { FreebuffModelOption } from '@codebuff/common/constants/freebuff-models'
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
// Section grouping (expanded view): model rows keep their tiers, but the
// premium models share one daily session quota while the unlimited ones have
// none. Putting the tier on a section header lets each row drop its redundant
// "Premium"/"Unlimited" chip. The PREMIUM header carries the shared quota
// inline — "N of M used · resets in …" — once any session is spent (turning
// amber when exhausted, the moment its rows grey out). When collapsed there's
// no PREMIUM header, but the recommended hero is unlimited, so the premium
// count is irrelevant and simply doesn't show; only the limited tier (no
// premium section) keeps a parent-rendered below-picker counter. UNLIMITED
// needs no annotation. Empty sections are filtered so a model set with no
// premium (or no unlimited) entries doesn't render an orphan header.
//
// `label` may be empty: limited-tier users only see the constrained model set,
// so the "LIMITED" header would just leak the internal tier name without
// organizing anything. Renderer treats an empty label as "no header row".
type Section = {
  key: 'premium' | 'unlimited' | 'limited'
  label: string
  models: readonly FreebuffModelOption[]
}

// Sentinel id for the expand/collapse toggle so it can ride the same
// keyboard-navigation list as the model rows (Tab/arrow to it, Enter to fire).
const TOGGLE_ID = '__freebuff_toggle__'

// Right-aligned CTA shown on the focused, joinable row so the highlighted card
// reads as a button ("you can press Enter here") instead of just a selection.
// Its width is reserved in the one-line width budget below so the cue never
// overflows or wraps the row (a wrap would desync the focused-row scroll math).
const FOCUS_CUE = 'Press Enter ↵'
const CUE_GAP = 2 // min gap between a row's details and the focused-row cue

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
 * Layout: the recommended model renders as a titled "RECOMMENDED" card with a
 * bright border. When expanded, the remaining rows are grouped into PREMIUM /
 * UNLIMITED sections so the tier is visible without a per-row chip; the shared
 * premium-session quota rides the PREMIUM header. Names align in a column
 * so taglines line up across rows. On narrow terminals the secondary details
 * (warning / deployment hours) drop onto an indented second line under the row.
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
}

export const FreebuffModelSelector: React.FC<FreebuffModelSelectorProps> = ({
  maxHeight,
  onExpandedChange,
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

  const availableModels = useMemo(
    // GLM 5.2 is a referral reward, not a freely-pickable model, so it's
    // surfaced by the separate FreebuffReferralBanner rather than this grid.
    () =>
      getFreebuffModelsForAccessTier(accessTier).filter(
        (m) => !isFreebuffGlmV52ModelId(m.id),
      ),
    [accessTier],
  )
  const recommendedModel = useMemo(() => {
    const id = getRecommendedFreebuffModelId(accessTier)
    return availableModels.find((m) => m.id === id) ?? availableModels[0]!
  }, [accessTier, availableModels])
  const otherModels = useMemo(
    () => availableModels.filter((m) => m.id !== recommendedModel.id),
    [availableModels, recommendedModel],
  )
  // Only worth collapsing when the toggle actually hides something. With a
  // single "other" model (limited tier) we just show both — a "see 1 more
  // model" toggle is noise.
  const canCollapse = otherModels.length >= 2

  // Default collapsed only on the landing screen and only when the saved/active
  // selection IS the recommended model — a returning user whose preference is a
  // different model gets the expanded list so their pick is visible and focused.
  const isLanding = session?.status === 'none' || !session
  const [expanded, setExpanded] = useState(
    () => !canCollapse || !isLanding || selectedModel !== recommendedModel.id,
  )
  // Mirror the expanded state up to the landing screen (collapsed → it
  // promotes the wordmark to the full ASCII logo). useLayoutEffect so the
  // parent's logo decision settles before paint, both on mount and on toggle.
  useLayoutEffect(() => {
    onExpandedChange?.(expanded)
  }, [expanded, onExpandedChange])

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
  const sections = useMemo(() => {
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
          models: otherModels.filter((m) => isFreebuffPremiumModelId(m.id)),
        },
        {
          key: 'unlimited',
          label: 'UNLIMITED',
          models: otherModels.filter((m) => !isFreebuffPremiumModelId(m.id)),
        },
      ] satisfies readonly Section[]
    ).filter((section) => section.models.length > 0)
  }, [expanded, accessTier, otherModels])

  // Model rows in render order: the recommended hero first, then (when
  // expanded) the grouped rest.
  const renderedModelIds = useMemo(
    () => [
      recommendedModel.id,
      ...sections.flatMap((section) => section.models.map((m) => m.id)),
    ],
    [recommendedModel, sections],
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
          : navIds[0]!,
    )
  }, [navIds, selectedModel])

  useEffect(() => {
    // Landing-screen safety net: if the in-memory selection becomes
    // unavailable (e.g. deployment hours close while the picker is open),
    // swap to the always-available fallback so Enter doesn't POST a model
    // the server will immediately reject. In-memory only — the user's saved
    // preference (e.g. Kimi or DeepSeek) is preserved for the next launch.
    if (
      (session?.status === 'none' || !session) &&
      (!renderedModelIds.includes(selectedModel) ||
        !isFreebuffModelAvailable(selectedModel, new Date(now)))
    ) {
      setSelectedModel(renderedModelIds[0] ?? FALLBACK_FREEBUFF_MODEL_ID)
    }
  }, [renderedModelIds, now, selectedModel, session, setSelectedModel])

  // No queued state any more: there's never a model the user is "already in"
  // the queue for, so re-picking is always meaningful.
  const committedModelId: string | null = null
  const rateLimitsByModel = getRateLimitsByModel(session)
  const referral = getReferralInfo(session)

  // Premium-session quota, surfaced on the PREMIUM header itself: "N of M used
  // · resets in …". All premium models share one pool; the server replicates
  // the same snapshot under every model id, so any entry has the right count.
  // The count shows from the start — even at "0 of M" — so full-access users
  // can see the daily pool and reset cadence before they spend anything; it
  // turns amber when the pool is exhausted — the same moment the premium rows
  // grey out — so the header explains why they're disabled. (The PREMIUM
  // section only renders for the full-access tier, so this is scoped to it.)
  const sharedRateLimit = rateLimitsByModel
    ? Object.values(rateLimitsByModel)[0]
    : undefined
  const premiumUsed = sharedRateLimit?.recentCount ?? 0
  const premiumExhausted = premiumUsed >= FREEBUFF_PREMIUM_SESSION_LIMIT
  // The pool resets daily on a Pacific-day boundary regardless of usage, so the
  // countdown is meaningful even at zero used — getFreebuffPremiumResetAt falls
  // back to the next day boundary when the server hasn't sent a resetAt yet.
  const premiumResetCountdown = formatFreebuffPremiumResetCountdown(
    getFreebuffPremiumResetAt({ rateLimitsByModel, nowMs: now }),
    now,
  )

  const BUTTON_CHROME = 4 // 2 border + 2 padding
  const NAME_GAP = 2 // spaces between name column and details column

  // Two-column layout: a fixed name column (padded to the longest displayName
  // across all rows) followed by a details column (tagline · warning ·
  // deployment-hours/closed). Falls back to single-column mode on narrow
  // terminals where the secondary details spill to an indented second line.
  // Computed across ALL models (not just the expanded ones) so the recommended
  // hero and the revealed rows share one width and nothing reflows on toggle.
  const {
    wrapDetails,
    buttonOuterWidth,
    nameColumnWidth,
    recommendedOneLineLen,
  } = useMemo(() => {
    const nameLen = (m: FreebuffModelOption) => m.displayName.length
    const maxNameLen = Math.max(...availableModels.map(nameLen))

    const detailsParts = (model: FreebuffModelOption): number[] => {
      const parts: number[] = []
      parts.push(model.tagline.length)
      if (model.warning) parts.push(model.warning.length)
      if (model.availability === 'deployment_hours') {
        parts.push(deploymentAvailabilityLabel.length)
      }
      return parts
    }

    const joinedLen = (parts: number[]): number =>
      parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 3 // " · "

    const oneLineLen = (model: FreebuffModelOption): number =>
      2 /* indicator + space */ +
      maxNameLen +
      NAME_GAP +
      joinedLen(detailsParts(model))

    // The cue lives only on the recommended hero, so only its line needs to fit
    // the "Press Enter ↵" gutter. Folding that into the max means longer rows
    // (e.g. DeepSeek Pro's data-collection warning) keep their natural width —
    // the buttons widen only if the recommended row + cue is the longest line.
    // Returned so the render path can right-align the cue against the same
    // length the gutter was reserved for — one formula, no reserve/consume drift.
    const recommendedOneLineLen = oneLineLen(recommendedModel)
    const maxOneLineOuter =
      Math.max(
        ...availableModels.map(oneLineLen),
        recommendedOneLineLen + CUE_GAP + FOCUS_CUE.length,
      ) + BUTTON_CHROME
    if (maxOneLineOuter <= contentMaxWidth) {
      return {
        wrapDetails: false,
        buttonOuterWidth: maxOneLineOuter,
        nameColumnWidth: maxNameLen,
        recommendedOneLineLen,
      }
    }

    // Narrow: line 1 = "indicator name · tagline", line 2 (if any) =
    // "  warning · hours". Compute the max of both so all buttons stay the
    // same width.
    const labelLineLen = (m: FreebuffModelOption) =>
      2 + m.displayName.length + 3 + m.tagline.length
    const detailsLineLen = (m: FreebuffModelOption) => {
      const parts: number[] = []
      if (m.warning) parts.push(m.warning.length)
      if (m.availability === 'deployment_hours') {
        parts.push(deploymentAvailabilityLabel.length)
      }
      return parts.length === 0 ? 0 : 2 /* indent */ + joinedLen(parts)
    }
    const maxTwoLineInner = Math.max(
      ...availableModels.map((m) =>
        Math.max(labelLineLen(m), detailsLineLen(m)),
      ),
    )
    return {
      wrapDetails: true,
      buttonOuterWidth: Math.min(
        maxTwoLineInner + BUTTON_CHROME,
        contentMaxWidth,
      ),
      nameColumnWidth: maxNameLen,
      recommendedOneLineLen,
    }
  }, [
    availableModels,
    contentMaxWidth,
    deploymentAvailabilityLabel,
    recommendedModel,
  ])

  const rowWraps = useCallback(
    (m: FreebuffModelOption) =>
      wrapDetails && (!!m.warning || m.availability === 'deployment_hours'),
    [wrapDetails],
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
    const heroHeight = 2 + (rowWraps(recommendedModel) ? 2 : 1)
    y += heroHeight
    sections.forEach((section) => {
      y += SECTION_GAP // every section sits below the hero (or prior one) with a gap
      if (section.label) y += 1
      section.models.forEach((m) => {
        y += 2 + (rowWraps(m) ? 2 : 1)
      })
    })
    if (canCollapse) {
      y += TOGGLE_MARGIN
      y += 1
    }
    return y
  }, [sections, rowWraps, recommendedModel, canCollapse])

  // When a referral exists, start at the parent's full allowance until the
  // wrapper reports its intrinsic height. This is conservative for the first
  // layout pass and cannot clip wrapped copy on a narrow terminal.
  const contentHeight =
    measuredContentHeight ?? (referral ? maxHeight : estimatedModelHeight)

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

  const isJoinable = useCallback(
    (modelId: string) => {
      if (!isFreebuffModelAvailable(modelId, new Date(now))) return false
      const rateLimit = rateLimitsByModel?.[modelId]
      return !rateLimit || rateLimit.recentCount < rateLimit.limit
    },
    [now, rateLimitsByModel],
  )

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
    setExpanded((prev) => {
      const next = !prev
      // After revealing the list, drop focus onto the first newly-shown row so
      // the next arrow press walks into it; after collapsing, return to the
      // hero so Enter starts.
      setFocusedId(
        next
          ? (otherModels[0]?.id ?? recommendedModel.id)
          : recommendedModel.id,
      )
      return next
    })
  }, [otherModels, recommendedModel])

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

    // Spaces inside <span>s render verbatim, so we hand-pad the name to align
    // taglines into a column. nameColumnWidth is the longest name across all
    // rows, so the diff is >= 0; +NAME_GAP guarantees breathing room even on
    // the widest row.
    const namePadding = ' '.repeat(
      nameColumnWidth - model.displayName.length + NAME_GAP,
    )

    // Right-aligned "Press Enter ↵" cue on the focused recommended row only.
    // Right-align against recommendedOneLineLen — the exact length the gutter was
    // reserved against above — so reserve and consume can't drift. The reservation
    // guarantees cuePad >= CUE_GAP in one-line mode; the guard keeps it safe in
    // wrap mode (no gutter reserved there) and against any contentMaxWidth clamp.
    const cuePad =
      buttonOuterWidth -
      BUTTON_CHROME -
      recommendedOneLineLen -
      FOCUS_CUE.length
    const showCue =
      recommended &&
      isFocused &&
      interactable &&
      !wrapDetails &&
      cuePad >= CUE_GAP

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
          {wrapDetails ? (
            <span fg={mutedColor}> · {model.tagline}</span>
          ) : (
            <>
              <span fg={mutedColor}>{namePadding + model.tagline}</span>
              {hasWarning && <span fg={warningColor}> · {model.warning}</span>}
              {hasHours && (
                <span fg={mutedColor}> · {deploymentAvailabilityLabel}</span>
              )}
              {showCue && (
                <span fg={theme.primary} attributes={TextAttributes.BOLD}>
                  {' '.repeat(cuePad) + FOCUS_CUE}
                </span>
              )}
            </>
          )}
        </text>
        {wrapDetails && (hasWarning || hasHours) && (
          <text>
            <span> </span>
            {hasWarning && <span fg={warningColor}>{model.warning}</span>}
            {hasWarning && hasHours && <span fg={mutedColor}> · </span>}
            {hasHours && (
              <span fg={mutedColor}>{deploymentAvailabilityLabel}</span>
            )}
          </text>
        )}
      </Button>
    )
  }

  const sectionsContent = sections.map((section) => (
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
              · {formatSessionUnits(premiumUsed)} of{' '}
              {FREEBUFF_PREMIUM_SESSION_LIMIT} used
            </span>
          )}
          {section.key === 'premium' && premiumResetCountdown && (
            <span fg={theme.muted}> · resets in {premiumResetCountdown}</span>
          )}
        </text>
      )}
      {section.models.map((m) => renderModelButton(m))}
    </box>
  ))

  // Expand/collapse affordance. Collapsed: "see all N models" invites the user
  // to browse past the recommended pick. Expanded: a quiet way back to the
  // single-card view.
  const toggleFocused = focusedId === TOGGLE_ID
  const toggleHovered = hoveredId === TOGGLE_ID
  const toggleColor = toggleFocused
    ? theme.primary
    : toggleHovered
      ? theme.foreground
      : theme.muted
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
        {renderModelButton(recommendedModel, { recommended: true })}
        {sectionsContent}
        {toggleContent}
        {referral && (
          <FreebuffReferralBanner
            width={buttonOuterWidth}
            referral={referral}
            accessTier={accessTier}
            focusedId={focusedId}
            onFocusTargetsChange={setExtraTargets}
          />
        )}
      </box>
    </scrollbox>
  )
}
