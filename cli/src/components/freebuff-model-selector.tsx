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
import {
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
  getFreebuffDeploymentAvailabilityLabel,
  getFreebuffModelsForAccessTier,
  getRecommendedFreebuffModelId,
  isFreebuffModelAvailable,
  isFreebuffPremiumModelId,
} from '@codebuff/common/constants/freebuff-models'
import { getRateLimitsByModel } from '@codebuff/common/types/freebuff-session'

import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
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
import type { KeyEvent, ScrollBoxRenderable } from '@opentui/core'

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

/**
 * Dual-purpose model picker:
 *   - Pre-chat landing (session 'none'): user hasn't joined any queue. Picking
 *     a model is their explicit commitment to enter — this triggers the POST.
 *     Opens collapsed to the recommended hero; Enter starts immediately.
 *   - In-queue switcher (session 'queued'): picking a *different* model moves
 *     the user to the back of that queue (lose place in original). Picking the
 *     model they're already in is a no-op. Opens expanded so every queue is
 *     visible.
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
 * On short terminals the parent passes `maxHeight`: the row list then lives
 * in a scrollbox capped at that many rows, a scrollbar appears when the
 * models don't all fit, and Tab/arrow navigation keeps the focused row
 * scrolled into view.
 */
interface FreebuffModelSelectorProps {
  /** Max vertical rows the picker may occupy. When the rendered rows exceed
   *  this, the list scrolls (scrollbar shown, focused row kept in view);
   *  otherwise the scrollbox shrinks to fit and no scrollbar appears. */
  maxHeight: number
  /** Notifies the parent whenever the picker expands/collapses. The waiting-room
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
  // waiting-room screen wraps this picker in a `maxWidth: contentMaxWidth`
  // box (capped at 80 cols), so a wide terminal doesn't actually let us
  // sprawl the buttons across it.
  const { contentMaxWidth } = useTerminalDimensions()
  const selectedModel = useFreebuffModelStore((s) => s.selectedModel)
  const setSelectedModel = useFreebuffModelStore((s) => s.setSelectedModel)
  const session = useFreebuffSessionStore((s) => s.session)
  const accessTier =
    session && 'accessTier' in session ? session.accessTier : 'full'
  const now = useNow(60_000)
  const deploymentAvailabilityLabel = useMemo(
    () => getFreebuffDeploymentAvailabilityLabel(new Date(now)),
    [now],
  )
  const [pending, setPending] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const availableModels = useMemo(
    () => getFreebuffModelsForAccessTier(accessTier),
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
    () =>
      !canCollapse || !isLanding || selectedModel !== recommendedModel.id,
  )
  // Mirror the expanded state up to the waiting-room screen (collapsed → it
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
  // Keyboard-navigable ids include the toggle so Tab/arrows can reach it.
  const navIds = useMemo(
    () => (canCollapse ? [...renderedModelIds, TOGGLE_ID] : renderedModelIds),
    [canCollapse, renderedModelIds],
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

  const committedModelId = session?.status === 'queued' ? session.model : null
  const rateLimitsByModel = getRateLimitsByModel(session)

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
  const { wrapDetails, buttonOuterWidth, nameColumnWidth } = useMemo(() => {
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

    const maxOneLineOuter =
      Math.max(...availableModels.map(oneLineLen)) + BUTTON_CHROME
    if (maxOneLineOuter <= contentMaxWidth) {
      return {
        wrapDetails: false,
        buttonOuterWidth: maxOneLineOuter,
        nameColumnWidth: maxNameLen,
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
    }
  }, [availableModels, contentMaxWidth, deploymentAvailabilityLabel])

  const rowWraps = useCallback(
    (m: FreebuffModelOption) =>
      wrapDetails && (!!m.warning || m.availability === 'deployment_hours'),
    [wrapDetails],
  )

  // Flattened vertical layout: every navigable element's top offset + height
  // within the scroll content, plus the total. Mirrors the JSX below exactly so
  // the auto-scroll math lands the focused row precisely. A button is 2 border
  // rows + its text line(s); in wrapDetails mode a row with a warning or
  // deployment-hours label spills its details onto a second indented line.
  // Headers add 1 row; sections after the first add 1 row of marginTop; the
  // toggle adds its marginTop + 1.
  const SECTION_GAP = 1
  const TOGGLE_MARGIN = 1
  const { totalHeight, offsetById } = useMemo(() => {
    const offsets: Record<string, { top: number; height: number }> = {}
    let y = 0
    // Recommended hero (a titled row, same height rules as any other row).
    const heroHeight = 2 + (rowWraps(recommendedModel) ? 2 : 1)
    offsets[recommendedModel.id] = { top: y, height: heroHeight }
    y += heroHeight
    sections.forEach((section) => {
      y += SECTION_GAP // every section sits below the hero (or prior one) with a gap
      if (section.label) y += 1
      section.models.forEach((m) => {
        const h = 2 + (rowWraps(m) ? 2 : 1)
        offsets[m.id] = { top: y, height: h }
        y += h
      })
    })
    if (canCollapse) {
      y += TOGGLE_MARGIN
      offsets[TOGGLE_ID] = { top: y, height: 1 }
      y += 1
    }
    return { totalHeight: y, offsetById: offsets }
  }, [sections, rowWraps, recommendedModel, canCollapse])

  const needsScroll = totalHeight > maxHeight
  const scrollViewportHeight = Math.max(1, Math.min(totalHeight, maxHeight))
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  // Keep the keyboard-focused element inside the viewport as the user
  // Tabs/arrows through a list taller than the available rows.
  useEffect(() => {
    const sb = scrollRef.current
    if (!sb || !needsScroll) return
    const entry = offsetById[focusedId]
    if (!entry) return
    const viewportHeight = sb.viewport.height
    const currentScroll = sb.scrollTop
    if (entry.top < currentScroll) {
      sb.scrollTop = entry.top
    } else if (entry.top + entry.height > currentScroll + viewportHeight) {
      sb.scrollTop = entry.top + entry.height - viewportHeight
    }
  }, [focusedId, offsetById, needsScroll])

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
      joinFreebuffQueue(modelId).finally(() => setPending(null))
    },
    [pending, committedModelId, isJoinable],
  )

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      // After revealing the list, drop focus onto the first newly-shown row so
      // the next arrow press walks into it; after collapsing, return to the
      // hero so Enter starts.
      setFocusedId(next ? (otherModels[0]?.id ?? recommendedModel.id) : recommendedModel.id)
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

    return (
      <Button
        key={model.id}
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
  const toggleColor = toggleFocused ? theme.primary : theme.muted
  const toggleLabel = expanded
    ? '↑  Show fewer'
    : `↓  See all ${availableModels.length} models`
  const toggleContent = canCollapse ? (
    <Button
      onClick={toggleExpanded}
      onMouseOver={() => setFocusedId(TOGGLE_ID)}
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
      {renderModelButton(recommendedModel, { recommended: true })}
      {sectionsContent}
      {toggleContent}
    </scrollbox>
  )
}
