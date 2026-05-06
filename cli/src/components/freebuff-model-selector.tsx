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
import {
  freebuffModelNavigationDirectionForKey,
  nextFreebuffModelId,
} from '../utils/freebuff-model-navigation'

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
const FREEBUFF_MODEL_SELECTOR_MODEL_IDS = FREEBUFF_MODEL_SELECTOR_MODELS.map(
  (model) => model.id,
)

// Section grouping: premium models share one quota pool (header carries the
// 0/5 counter); the unlimited model has none. Putting the tier on a section
// header lets each row drop its redundant "Premium"/"Unlimited" chip. Empty
// sections are filtered out so a model set with no premium (or no unlimited)
// entries doesn't render an orphan header.
type Section = {
  key: 'premium' | 'unlimited'
  label: string
  models: readonly FreebuffModelOption[]
}

const SECTIONS: readonly Section[] = (
  [
    {
      key: 'premium',
      label: 'PREMIUM',
      models: FREEBUFF_MODEL_SELECTOR_MODELS.filter((m) =>
        isFreebuffPremiumModelId(m.id),
      ),
    },
    {
      key: 'unlimited',
      label: 'UNLIMITED',
      models: FREEBUFF_MODEL_SELECTOR_MODELS.filter(
        (m) => !isFreebuffPremiumModelId(m.id),
      ),
    },
  ] satisfies readonly Section[]
).filter((section) => section.models.length > 0)

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
 * Layout: rows are grouped into PREMIUM / UNLIMITED sections so the tier is
 * visible without a per-row chip; the shared 0/5 counter sits inside the
 * PREMIUM section header. Names align in a column so taglines line up across
 * rows. On narrow terminals the secondary details (warning / deployment
 * hours) drop onto an indented second line under the row.
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
  // absent) so the section header can render the single shared counter.
  const sharedPremiumUsed = useMemo(
    () =>
      rateLimitsByModel
        ? (Object.values(rateLimitsByModel)[0]?.recentCount ?? 0)
        : 0,
    [rateLimitsByModel],
  )

  const BUTTON_CHROME = 4 // 2 border + 2 padding
  const NAME_GAP = 2 // spaces between name column and details column

  // Two-column layout: a fixed name column (padded to the longest displayName
  // across all rows) followed by a details column (tagline · warning ·
  // deployment-hours/closed). Falls back to single-column mode on narrow
  // terminals where the secondary details spill to an indented second line.
  const { wrapDetails, buttonOuterWidth, nameColumnWidth } = useMemo(() => {
    const nameLen = (m: FreebuffModelOption) => m.displayName.length
    const maxNameLen = Math.max(...FREEBUFF_MODEL_SELECTOR_MODELS.map(nameLen))

    const detailsParts = (model: FreebuffModelOption): number[] => {
      const parts = [model.tagline.length]
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
      Math.max(...FREEBUFF_MODEL_SELECTOR_MODELS.map(oneLineLen)) +
      BUTTON_CHROME
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
      nameColumnWidth: maxNameLen,
    }
  }, [contentMaxWidth, deploymentAvailabilityLabel])

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
        const direction = freebuffModelNavigationDirectionForKey(key)
        const isCommit =
          name === 'return' || name === 'enter' || name === 'space'
        if (isCommit) {
          if (isJoinable(focusedId) && focusedId !== committedModelId) {
            key.preventDefault?.()
            key.stopPropagation?.()
            pick(focusedId)
          }
          return
        }
        if (!direction) return
        const targetId = nextFreebuffModelId({
          modelIds: FREEBUFF_MODEL_SELECTOR_MODEL_IDS,
          focusedId,
          direction,
        })
        if (targetId) {
          key.preventDefault?.()
          key.stopPropagation?.()
          setFocusedId(targetId)
        }
      },
      [pending, pick, focusedId, committedModelId, isJoinable],
    ),
  )

  const renderModelButton = (model: FreebuffModelOption) => {
    // Single visual state: the focused row IS the highlight. The user's
    // saved/committed pick is not shown separately — it just sets where
    // focus lands when the picker opens. Pressing Enter on the focused
    // row commits it.
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

  // Counter goes amber-ish (theme.secondary) when the pool is exhausted so
  // the limit reads as "you've hit it" rather than just another count.
  const premiumExhausted = sharedPremiumUsed >= FREEBUFF_PREMIUM_SESSION_LIMIT
  const counterColor = premiumExhausted ? theme.secondary : theme.muted

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
      }}
    >
      {SECTIONS.map((section, sectionIdx) => (
        <box
          key={section.key}
          style={{
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0,
            marginTop: sectionIdx === 0 ? 0 : 1,
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.muted}>{section.label}</span>
            {section.key === 'premium' && (
              <span fg={counterColor}>
                {'  ·  '}
                {formatSessionUnits(sharedPremiumUsed)} /{' '}
                {FREEBUFF_PREMIUM_SESSION_LIMIT} used today
              </span>
            )}
          </text>
          {section.models.map(renderModelButton)}
        </box>
      ))}
    </box>
  )
}
