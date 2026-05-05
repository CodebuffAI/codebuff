import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from './button'
import {
  DEFAULT_FREEBUFF_MODEL_ID,
  FALLBACK_FREEBUFF_MODEL_ID,
  FREEBUFF_MODELS,
  FREEBUFF_PREMIUM_SESSION_LIMIT,
  getFreebuffDeploymentAvailabilityLabel,
  isFreebuffModelAvailable,
  isFreebuffPremiumModelId,
} from '@codebuff/common/constants/freebuff-models'

import { joinFreebuffQueue } from '../hooks/use-freebuff-session'
import { useNow } from '../hooks/use-now'
import { useFreebuffModelStore } from '../state/freebuff-model-store'
import { useFreebuffSessionStore } from '../state/freebuff-session-store'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { nextFreebuffModelId } from '../utils/freebuff-model-navigation'

import type { FreebuffModelOption } from '@codebuff/common/constants/freebuff-models'
import type { KeyEvent } from '@opentui/core'

// Widen the readonly tuple from FREEBUFF_MODELS to FreebuffModelOption[] so
// the selector can branch on optional fields (e.g. `warning`) and on
// availability values that aren't present in today's set but might be added
// later, without TS narrowing the literal types away.
const FREEBUFF_MODEL_SELECTOR_MODELS: readonly FreebuffModelOption[] = [
  ...FREEBUFF_MODELS.filter((model) => model.id === DEFAULT_FREEBUFF_MODEL_ID),
  ...FREEBUFF_MODELS.filter((model) => model.id !== DEFAULT_FREEBUFF_MODEL_ID),
]

function formatSessionUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(1)
}

/**
 * Dual-purpose model picker:
 *   - Pre-chat landing (session 'none'): user hasn't joined any queue. Picking
 *     a model is their explicit commitment to enter — this triggers the POST.
 *   - In-queue switcher (session 'queued'): picking a *different* model moves
 *     the user to the back of that queue (lose place in original). Picking the
 *     model they're already in is a no-op.
 *
 * Keyboard navigation: Tab / arrow keys move the green highlight; Enter (or
 * Space) commits the focused row. Mouse click commits in one step.
 *
 * Always stacked vertically. On narrow terminals where the longest one-line
 * label wouldn't fit, the secondary details (warning / deployment hours)
 * spill onto an indented second line under the name.
 */
export const FreebuffModelSelector: React.FC = () => {
  const theme = useTheme()
  // contentMaxWidth (not terminalWidth) is the real budget — the parent
  // waiting-room screen wraps this picker in a `maxWidth: contentMaxWidth`
  // box (capped at 80 cols), so a wide terminal doesn't actually let us
  // sprawl the buttons across it.
  const { contentMaxWidth } = useTerminalDimensions()
  const selectedModel = useFreebuffModelStore((s) => s.selectedModel)
  const setSelectedModel = useFreebuffModelStore((s) => s.setSelectedModel)
  const session = useFreebuffSessionStore((s) => s.session)
  const now = useNow(60_000)
  const deploymentAvailabilityLabel = useMemo(
    () => getFreebuffDeploymentAvailabilityLabel(new Date(now)),
    [now],
  )
  const [pending, setPending] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Keyboard cursor — separate from the actually-selected model so that
  // Tab/arrow navigation can preview without committing. Re-syncs to the
  // selected model whenever the selection changes (after a successful switch
  // or an external selectedModel update).
  const [focusedId, setFocusedId] = useState<string>(selectedModel)
  useEffect(() => {
    setFocusedId(selectedModel)
  }, [selectedModel])

  useEffect(() => {
    // Landing-screen safety net: if the in-memory selection becomes
    // unavailable (e.g. deployment hours close while the picker is open),
    // swap to the always-available fallback so Enter doesn't POST a model
    // the server will immediately reject. In-memory only — the user's saved
    // preference (e.g. Kimi or DeepSeek) is preserved for the next launch.
    if (
      (session?.status === 'none' || !session) &&
      !isFreebuffModelAvailable(selectedModel, new Date(now))
    ) {
      setSelectedModel(FALLBACK_FREEBUFF_MODEL_ID)
    }
  }, [now, selectedModel, session, setSelectedModel])

  const committedModelId = session?.status === 'queued' ? session.model : null
  const rateLimitsByModel =
    session && 'rateLimitsByModel' in session
      ? session.rateLimitsByModel
      : undefined

  // All premium models share one quota pool: the server replicates the same
  // snapshot under each premium model id, so any entry has the right count.
  // Grab the first one (or 0 when the user has no usage and the map is
  // absent) so the footer can render the single shared counter.
  const sharedPremiumUsed = useMemo(
    () =>
      rateLimitsByModel
        ? (Object.values(rateLimitsByModel)[0]?.recentCount ?? 0)
        : 0,
    [rateLimitsByModel],
  )

  // Per-row hint is a tier badge, not a quota counter: premium models share
  // the 5-session pool (shown once in the footer); MiniMax is unlimited.
  const getTierLabel = useCallback(
    (modelId: string): string =>
      isFreebuffPremiumModelId(modelId) ? 'Premium' : 'Unlimited',
    [],
  )

  const BUTTON_CHROME = 4 // 2 border + 2 padding

  // Decide whether secondary details (warning / deployment hours) get their
  // own indented line under the name. All buttons share a uniform width so
  // the column reads as a clean stack of equal choices.
  const { wrapDetails, buttonOuterWidth } = useMemo(() => {
    const detailsTextLen = (model: FreebuffModelOption): number => {
      const parts: number[] = []
      if (model.availability === 'deployment_hours') {
        parts.push(deploymentAvailabilityLabel.length)
      }
      if (model.warning) parts.push(model.warning.length)
      if (parts.length === 0) return 0
      return (
        parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * 3
      ) /* " · " */
    }

    const hintLen = (model: FreebuffModelOption): number =>
      Math.max(getTierLabel(model.id).length, 'Closed'.length)

    const oneLineLen = (model: FreebuffModelOption): number => {
      const inlineDetails = detailsTextLen(model)
      return (
        2 /* indicator + space */ +
        model.displayName.length +
        3 /* " · " */ +
        model.tagline.length +
        (inlineDetails > 0 ? 3 + inlineDetails : 0) +
        3 /* " · " before hint */ +
        hintLen(model)
      )
    }

    const labelLineLen = (model: FreebuffModelOption): number =>
      2 +
      model.displayName.length +
      3 +
      model.tagline.length +
      3 +
      hintLen(model)

    const detailsLineLen = (model: FreebuffModelOption): number => {
      const len = detailsTextLen(model)
      return len === 0 ? 0 : 2 /* indent */ + len
    }

    const maxOneLineOuter =
      Math.max(...FREEBUFF_MODEL_SELECTOR_MODELS.map(oneLineLen)) +
      BUTTON_CHROME
    if (maxOneLineOuter <= contentMaxWidth) {
      return { wrapDetails: false, buttonOuterWidth: maxOneLineOuter }
    }
    const maxTwoLineInner = Math.max(
      ...FREEBUFF_MODEL_SELECTOR_MODELS.map((m) =>
        Math.max(labelLineLen(m), detailsLineLen(m)),
      ),
    )
    return {
      wrapDetails: true,
      buttonOuterWidth: Math.min(
        maxTwoLineInner + BUTTON_CHROME,
        contentMaxWidth,
      ),
    }
  }, [contentMaxWidth, deploymentAvailabilityLabel, getTierLabel])

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

  // Tab / Shift+Tab and arrow keys move the focus highlight only; Enter or
  // Space commits the focused row. Two-step navigation lets the user preview
  // the highlight before committing.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (pending) return
        const name = key.name ?? ''
        const isForward =
          name === 'right' || name === 'down' || (name === 'tab' && !key.shift)
        const isBackward =
          name === 'left' || name === 'up' || (name === 'tab' && key.shift)
        const isCommit =
          name === 'return' || name === 'enter' || name === 'space'
        if (!isForward && !isBackward && !isCommit) return
        if (isCommit) {
          if (isJoinable(focusedId) && focusedId !== committedModelId) {
            key.preventDefault?.()
            pick(focusedId)
          }
          return
        }
        const targetId = nextFreebuffModelId({
          modelIds: FREEBUFF_MODEL_SELECTOR_MODELS.map((model) => model.id),
          focusedId,
          direction: isForward ? 'forward' : 'backward',
        })
        if (targetId) {
          key.preventDefault?.()
          setFocusedId(targetId)
        }
      },
      [pending, pick, focusedId, committedModelId, isJoinable],
    ),
  )

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
      }}
    >
      {FREEBUFF_MODEL_SELECTOR_MODELS.map((model) => {
        // Single visual state: the focused row IS the highlight. The user's
        // saved/committed pick is not shown separately — it just sets where
        // focus lands when the picker opens. Pressing Enter on the focused
        // row commits it.
        const isHovered = hoveredId === model.id
        const isFocused = focusedId === model.id
        const isAvailable = isFreebuffModelAvailable(model.id, new Date(now))
        const canJoin = isJoinable(model.id)
        // Clickable whenever picking would actually do something — i.e.
        // anything except re-picking the queue we're already in.
        const interactable =
          !pending && canJoin && model.id !== committedModelId
        const tierLabel = getTierLabel(model.id)
        const hint = isAvailable ? tierLabel : 'Closed'

        // Focused row: green border + arrow indicator + bold name. The name
        // itself stays the normal foreground color so it doesn't shout — the
        // border and arrow do the highlighting. Off-focus rows are default.
        const indicator = isFocused ? '›' : ' '
        const fgColor = canJoin ? theme.foreground : theme.muted
        const mutedColor = theme.muted
        const warningColor = theme.secondary
        const hintColor = canJoin ? theme.muted : theme.secondary

        const borderColor = isFocused
          ? theme.primary
          : isHovered
            ? theme.foreground
            : theme.border

        const showInlineHours =
          !wrapDetails && model.availability === 'deployment_hours'
        const showInlineWarning = !wrapDetails && !!model.warning
        const showWrappedDetails =
          wrapDetails &&
          (model.availability === 'deployment_hours' || !!model.warning)

        return (
          <Button
            key={model.id}
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
                attributes={
                  isFocused ? TextAttributes.BOLD : TextAttributes.NONE
                }
              >
                {model.displayName}
              </span>
              <span fg={mutedColor}> · {model.tagline}</span>
              {showInlineHours && (
                <span fg={mutedColor}> · {deploymentAvailabilityLabel}</span>
              )}
              {showInlineWarning && (
                <span fg={warningColor}> · {model.warning}</span>
              )}
              <span fg={hintColor}> · {hint}</span>
            </text>
            {showWrappedDetails && (
              <text>
                <span> </span>
                {model.availability === 'deployment_hours' && (
                  <span fg={mutedColor}>{deploymentAvailabilityLabel}</span>
                )}
                {model.availability === 'deployment_hours' && model.warning && (
                  <span fg={mutedColor}> · </span>
                )}
                {model.warning && (
                  <span fg={warningColor}>{model.warning}</span>
                )}
              </text>
            )}
          </Button>
        )
      })}
      {/* Single shared-quota footer. Replaces the per-row "X/5 used" hints
          which made it look like each premium model had its own pool.
          wrapMode: 'word' so the line reflows on narrow terminals instead of
          clipping. */}
      <text style={{ fg: theme.muted, marginTop: 1, wrapMode: 'word' }}>
        {formatSessionUnits(sharedPremiumUsed)} /{' '}
        {FREEBUFF_PREMIUM_SESSION_LIMIT} premium sessions used today
      </text>
    </box>
  )
}
