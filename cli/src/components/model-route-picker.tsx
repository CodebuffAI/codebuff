import { TextAttributes } from '@opentui/core'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { SelectableList } from './selectable-list'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { createTextPasteHandler } from '../utils/strings'
import {
  getEditableConfig,
  getKnownModelOptions,
  persistModelToProviderConfig,
  setRouteModel,
  writeMergedConfig,
} from '../utils/openbuff-provider'

import type { SelectableListItem } from './selectable-list'
import type {
  KnownModelOption,
  ModelRouteTarget,
  ReasoningEffortInput,
} from '../utils/openbuff-provider'
import type { OpenbuffReasoningEffort, ProviderConfigFileInput } from '@codebuff/sdk'

const LAYOUT = {
  CONTENT_PADDING: 4,
  COMPACT_MODE_THRESHOLD: 20,
  MAIN_CONTENT_PADDING: 2,
  MAX_RENDERED_ITEMS: 100,
} as const

type RoutableModelValue =
  | string
  | { model: string; reasoningEffort?: OpenbuffReasoningEffort }

/** Extract display string from a routable model value (string or { model, reasoningEffort }). */
function displayModel(route: RoutableModelValue | undefined): string | undefined {
  if (!route) return undefined
  if (typeof route === 'string') return route
  return route.model
}

// --- Reasoning effort types and options ---\n
type ReasoningChoice = Exclude<ReasoningEffortInput, undefined>

interface ReasoningOption {
  value: ReasoningChoice
  label: string
  description: string
}

const REASONING_OPTIONS: ReasoningOption[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Use the agent/provider default reasoning effort',
  },
  {
    value: 'low',
    label: 'Low',
    description: 'Fast tool loops; good for straightforward edits',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Balanced reasoning for most tasks',
  },
  {
    value: 'high',
    label: 'High',
    description: 'More reasoning for planning and hard problems',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Cheapest/fastest where supported',
  },
  {
    value: 'none',
    label: 'None',
    description: 'Disable reasoning where supported',
  },
]

/** Read the current reasoning effort override for a route target from config. */
function getRouteReasoningEffort(
  config: ProviderConfigFileInput,
  target: ModelRouteTarget,
): OpenbuffReasoningEffort | undefined {
  const normalize = (
    effort: OpenbuffReasoningEffort | null | undefined,
  ): OpenbuffReasoningEffort | undefined => effort ?? undefined

  if (target.type === 'default') {
    return normalize(config.defaultReasoningEffort)
  }
  if (target.type === 'mode') {
    return normalize(config.modeReasoningEfforts?.[target.mode])
  }
  return normalize(config.agentReasoningEfforts?.[target.agentId])
}

/** Format reasoning effort for display in route labels. */
function formatReasoning(effort: OpenbuffReasoningEffort | undefined): string {
  return effort ? String(effort) : 'default'
}

interface RouteItem {
  id: string
  label: string
  secondary: string
  target?: ModelRouteTarget
  currentModel: string | undefined
  currentReasoningEffort: OpenbuffReasoningEffort | undefined
  isHeader?: boolean
}

interface ModelRoutePickerProps {
  onClose: () => void
  onConfigUpdated?: () => void
}

type PickerPane = 'left' | 'right'
type RightView = 'model-select' | 'reasoning-select'

const isHeaderItem = (item: SelectableListItem | undefined): boolean =>
  item?.id.startsWith('section-') ?? false

const firstSelectableIndex = (items: SelectableListItem[]): number => {
  const index = items.findIndex((item) => !isHeaderItem(item))
  return index === -1 ? 0 : index
}

/** Filter out section headers that have no visible child routes. */
function filterOrphanHeaders(filtered: SelectableListItem[]): SelectableListItem[] {
  const routeIds = new Set(
    filtered
      .filter((item) => !isHeaderItem(item))
      .map((item) => item.id),
  )

  const headerPrefixes = new Map<string, string[]>([
    ['section-default', ['route-default']],
    ['section-modes', ['route-mode-']],
    ['section-agents', ['route-agent-']],
  ])

  return filtered.filter((item) => {
    if (!isHeaderItem(item)) return true
    const prefixes = headerPrefixes.get(item.id)
    if (!prefixes) return false
    return prefixes.some((prefix) =>
      [...routeIds].some((routeId) => routeId.startsWith(prefix)),
    )
  })
}

const nextSelectableIndex = (
  items: SelectableListItem[],
  currentIndex: number,
  direction: 1 | -1,
): number => {
  if (items.length === 0) return 0

  let index = Math.max(0, Math.min(items.length - 1, currentIndex))
  for (let step = 0; step < items.length; step++) {
    index = Math.max(0, Math.min(items.length - 1, index + direction))
    if (!isHeaderItem(items[index])) return index
    if (index === 0 || index === items.length - 1) break
  }

  return isHeaderItem(items[currentIndex])
    ? firstSelectableIndex(items)
    : currentIndex
}

export const ModelRoutePicker: React.FC<ModelRoutePickerProps> = ({
  onClose,
  onConfigUpdated,
}) => {
  const theme = useTheme()
  const { terminalWidth, terminalHeight } = useTerminalLayout()

  const isCompactMode = terminalHeight < LAYOUT.COMPACT_MODE_THRESHOLD

  // Master State: Dual-Pane split screen Dashboard
  const [activePane, setActivePane] = useState<PickerPane>('left')
  const [leftSearchQuery, setLeftSearchQuery] = useState('')
  // Track the input cursor so paste inserts at the cursor (not always the end).
  const [leftSearchCursor, setLeftSearchCursor] = useState(0)
  const [leftFocusedIndex, setLeftFocusedIndex] = useState(0)

  const [rightView, setRightView] = useState<RightView>('model-select')
  const [rightSearchQuery, setRightSearchQuery] = useState('')
  const [rightSearchCursor, setRightSearchCursor] = useState(0)
  const [rightFocusedIndex, setRightFocusedIndex] = useState(0)

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedModelDiscovered, setSelectedModelDiscovered] = useState(false)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [configKey, setConfigKey] = useState(0) // Force refresh after writes

  // Load current config
  const config = useMemo(() => {
    void configKey
    return getEditableConfig()
  }, [configKey])

  // Build route items from config
  const routeItems: RouteItem[] = useMemo(() => {
    const items: RouteItem[] = []

    items.push({
      id: 'section-default',
      label: 'Default',
      secondary: '',
      currentModel: undefined,
      currentReasoningEffort: undefined,
      isHeader: true,
    })

    // Default model
    const defaultModel = displayModel(config.defaultModel)
    items.push({
      id: 'route-default',
      label: 'default',
      secondary: defaultModel ?? '(not set)',
      target: { type: 'default' },
      currentModel: defaultModel ?? undefined,
      currentReasoningEffort: getRouteReasoningEffort(config, { type: 'default' }),
    })

    items.push({
      id: 'section-modes',
      label: 'Modes',
      secondary: '',
      currentModel: undefined,
      currentReasoningEffort: undefined,
      isHeader: true,
    })

    // Modes
    const modes: Array<'default' | 'plan'> = ['default', 'plan']
    for (const mode of modes) {
      const model = displayModel(config.modes?.[mode])
      items.push({
        id: `route-mode-${mode}`,
        label: `mode:${mode}`,
        secondary: model ?? '(not set)',
        target: { type: 'mode', mode },
        currentModel: model ?? undefined,
        currentReasoningEffort: getRouteReasoningEffort(config, { type: 'mode', mode }),
      })
    }

    items.push({
      id: 'section-agents',
      label: 'Agent overrides',
      secondary: '',
      currentModel: undefined,
      currentReasoningEffort: undefined,
      isHeader: true,
    })

    // Agent overrides
    for (const [agentId, model] of Object.entries(config.agents ?? {})) {
      items.push({
        id: `route-agent-${agentId}`,
        label: `agent:${agentId}`,
        secondary: displayModel(model) ?? '(not set)',
        target: { type: 'agent', agentId },
        currentModel: displayModel(model) ?? undefined,
        currentReasoningEffort: getRouteReasoningEffort(config, { type: 'agent', agentId }),
      })
    }

    return items
  }, [config])

  // Convert to SelectableListItem format with reasoning in label
  const selectableRouteItems: SelectableListItem[] = useMemo(
    () =>
      routeItems.map((route) => {
        const reasoningSuffix = !route.isHeader && route.currentReasoningEffort
          ? ` (reasoning: ${formatReasoning(route.currentReasoningEffort)})`
          : ''
        return {
          id: route.id,
          label: route.isHeader
            ? route.label
            : `${route.label} → ${route.secondary}${reasoningSuffix}`,
          icon: route.isHeader ? '' : route.currentModel ? '✓' : '○',
          secondary: route.secondary,
          hideSecondary: true,
          accent: route.isHeader,
        }
      }),
    [routeItems],
  )

  const filteredRoutes = useMemo(() => {
    const raw = selectableRouteItems.filter((item) => {
      if (!leftSearchQuery.trim()) return true
      const q = leftSearchQuery.toLowerCase()
      return (
        item.label.toLowerCase().includes(q) ||
        (item.secondary ?? '').toLowerCase().includes(q)
      )
    })
    return filterOrphanHeaders(raw)
  }, [selectableRouteItems, leftSearchQuery])

  // Track currently highlighted Left Pane Route
  const highlightedRoute = useMemo(() => {
    const item = filteredRoutes[leftFocusedIndex]
    if (!item) return null
    return routeItems.find((r) => r.id === item.id) || null
  }, [filteredRoutes, leftFocusedIndex, routeItems])

  // Right Pane Model Options
  const availableModels = useMemo(() => {
    void configKey
    return getKnownModelOptions()
  }, [configKey])

  const selectableModelItems: SelectableListItem[] = useMemo(
    () =>
      availableModels.map((option) => ({
        id: option.model,
        label: option.capabilitiesSummary
          ? `${option.model} | ${option.capabilitiesSummary}`
          : option.model,
        secondary: option.capabilitiesSummary,
      })),
    [availableModels],
  )

  const filteredModels = useMemo(() => {
    if (!rightSearchQuery.trim()) return selectableModelItems
    const q = rightSearchQuery.toLowerCase()
    return selectableModelItems.filter((item) =>
      item.label.toLowerCase().includes(q),
    )
  }, [selectableModelItems, rightSearchQuery])

  // Right Pane Reasoning Effort Options
  const currentReasoningForRoute = highlightedRoute?.currentReasoningEffort
  const selectableReasoningItems: SelectableListItem[] = useMemo(
    () =>
      REASONING_OPTIONS.map((option) => ({
        id: option.value,
        label:
          option.value === (currentReasoningForRoute ?? 'default')
            ? `${option.label} ✓`
            : option.label,
        secondary: option.description,
      })),
    [currentReasoningForRoute],
  )

  const filteredReasoningOptions = useMemo(() => {
    if (!rightSearchQuery.trim()) return selectableReasoningItems
    const q = rightSearchQuery.toLowerCase()
    return selectableReasoningItems.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      (item.secondary ?? '').toLowerCase().includes(q),
    )
  }, [selectableReasoningItems, rightSearchQuery])

  // Right Pane Items & Empty Messages
  const rightItems = useMemo(() => {
    return rightView === 'model-select' ? filteredModels : filteredReasoningOptions
  }, [rightView, filteredModels, filteredReasoningOptions])

  const rightEmptyMessage = useMemo(() => {
    if (rightView === 'model-select') {
      return rightSearchQuery ? 'No matching models' : 'No models available'
    }
    return 'No reasoning options'
  }, [rightView, rightSearchQuery])

  // Bound indexes dynamically
  useEffect(() => {
    setLeftFocusedIndex((prev) => Math.min(Math.max(0, filteredRoutes.length - 1), prev))
  }, [filteredRoutes])

  useEffect(() => {
    setRightFocusedIndex((prev) => Math.min(Math.max(0, rightItems.length - 1), prev))
  }, [rightItems])

  useEffect(() => {
    return () => {
      if (statusClearTimerRef.current) {
        clearTimeout(statusClearTimerRef.current)
      }
    }
  }, [])

  // Core Keyboard Dashboard Navigation Interceptor
  const handleKeyIntercept = useCallback(
    (key: { name?: string; shift?: boolean; ctrl?: boolean }) => {
      // Global exit key
      if (key.name === 'c' && key.ctrl) {
        onClose()
        return true
      }

      if (activePane === 'left') {
        if (key.name === 'escape') {
          if (leftSearchQuery.length > 0) {
            setLeftSearchQuery('')
            return true
          }
          onClose()
          return true
        }
        if (key.name === 'up') {
          setLeftFocusedIndex((prev) => nextSelectableIndex(filteredRoutes, prev, -1))
          return true
        }
        if (key.name === 'down') {
          setLeftFocusedIndex((prev) => nextSelectableIndex(filteredRoutes, prev, 1))
          return true
        }
        if (
          key.name === 'return' ||
          key.name === 'enter' ||
          key.name === 'right' ||
          key.name === 'tab'
        ) {
          const focused = filteredRoutes[leftFocusedIndex]
          if (focused && !isHeaderItem(focused)) {
            setActivePane('right')
            setRightView('model-select')
            setRightSearchQuery('')
            setRightFocusedIndex(0)
          }
          return true
        }
      } else if (activePane === 'right') {
        if (key.name === 'escape' || key.name === 'left') {
          if (rightSearchQuery.length > 0) {
            setRightSearchQuery('')
            return true
          }
          setActivePane('left')
          return true
        }
        if (key.name === 'tab') {
          setActivePane('left')
          return true
        }
        if (key.name === 'up') {
          setRightFocusedIndex((prev) => Math.max(0, prev - 1))
          return true
        }
        if (key.name === 'down') {
          setRightFocusedIndex((prev) => Math.min(rightItems.length - 1, prev + 1))
          return true
        }
        if (key.name === 'return' || key.name === 'enter') {
          const focusedItem = rightItems[rightFocusedIndex]
          if (!focusedItem) return true

          if (rightView === 'model-select') {
            // Model Selected! Progress to reasoning select
            const modelOption = availableModels.find((opt) => opt.model === focusedItem.id)
            setSelectedModelId(focusedItem.id)
            setSelectedModelDiscovered(modelOption?.discovered ?? false)
            setRightView('reasoning-select')
            setRightSearchQuery('')
            setRightFocusedIndex(0)
          } else {
            // Reasoning Selected! Commit config to disk
            if (!highlightedRoute?.target || !selectedModelId) return true
            const reasoningChoice = focusedItem.id as ReasoningChoice

            try {
              if (selectedModelDiscovered) {
                const slashIndex = selectedModelId.indexOf('/')
                if (slashIndex > 0 && slashIndex < selectedModelId.length - 1) {
                  const providerId = selectedModelId.slice(0, slashIndex)
                  const modelId = selectedModelId.slice(slashIndex + 1)
                  persistModelToProviderConfig(providerId, modelId)
                }
              }

              const editableConfig = getEditableConfig()
              setRouteModel(editableConfig, highlightedRoute.target, selectedModelId, reasoningChoice)
              const configPath = writeMergedConfig(editableConfig)

              const reasoningDisplay = reasoningChoice === 'default' ? 'default' : reasoningChoice
              const msg = `✓ Saved: ${highlightedRoute.label} → ${selectedModelId} (reasoning: ${reasoningDisplay})`
              setStatusMessage(msg)

              if (statusClearTimerRef.current) {
                clearTimeout(statusClearTimerRef.current)
              }
              statusClearTimerRef.current = setTimeout(() => {
                setStatusMessage((current) => (current === msg ? null : current))
              }, 4000)

              setConfigKey((k) => k + 1)
              setActivePane('left')
              setSelectedModelId(null)
              setSelectedModelDiscovered(false)
              onConfigUpdated?.()
            } catch (error) {
              setStatusMessage(`✗ ${error instanceof Error ? error.message : String(error)}`)
            }
          }
          return true
        }
      }
      return false
    },
    [
      activePane,
      leftSearchQuery,
      filteredRoutes,
      leftFocusedIndex,
      rightSearchQuery,
      rightItems,
      rightFocusedIndex,
      rightView,
      selectedModelId,
      selectedModelDiscovered,
      highlightedRoute,
      availableModels,
      onClose,
      onConfigUpdated,
    ],
  )

  const activeRouteLabel = highlightedRoute ? highlightedRoute.label : 'None'
  const activeModelDisplay = highlightedRoute ? (highlightedRoute.currentModel || '(not set)') : '—'
  const activeReasoningDisplay = highlightedRoute ? formatReasoning(highlightedRoute.currentReasoningEffort) : 'default'

  const helpText =
    activePane === 'left'
      ? '↑↓ Navigate routes · Tab/Enter Edit selected · Esc Close'
      : activePane === 'right'
        ? `Right Panel editing: ${rightView === 'model-select' ? 'Choose Model' : 'Choose Reasoning'} · Tab/Esc back`
        : '↑↓ Navigate · Enter select'

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.surface,
        padding: 0,
        flexDirection: 'column',
      }}
    >
      {/* Header bar */}
      {!isCompactMode && (
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 2,
            paddingRight: 2,
            marginTop: 1,
            marginBottom: 1,
            flexShrink: 0,
          }}
        >
          <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
            Model Route & Agent Configuration Dashboard
          </text>
          {statusMessage && (
            <text style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>
              {statusMessage}
            </text>
          )}
        </box>
      )}

      {/* Main Dual-Pane Dashboard Area */}
      <box
        style={{
          flexDirection: 'row',
          flexGrow: 1,
          flexShrink: 1,
          width: '100%',
          paddingLeft: 2,
          paddingRight: 2,
          gap: 1,
        }}
      >
        {/* LEFT PANEL: Routes list */}
        <box
          style={{
            flexDirection: 'column',
            width: '45%',
            flexGrow: 1,
            flexShrink: 1,
          }}
        >
          <text style={{ fg: activePane === 'left' ? theme.primary : theme.muted, attributes: TextAttributes.BOLD, marginBottom: 0 }}>
            {activePane === 'left' ? '▶ Route Targets' : '  Route Targets'}
          </text>
          
          <box style={{ flexShrink: 0, marginBottom: 0 }}>
            <MultilineInput
              value={leftSearchQuery}
              onChange={({ text, cursorPosition }) => {
                setLeftSearchQuery(text)
                setLeftSearchCursor(cursorPosition)
              }}
              onSubmit={() => {}}
              onPaste={createTextPasteHandler(
                leftSearchQuery,
                Math.min(leftSearchCursor, leftSearchQuery.length),
                ({ text, cursorPosition }) => {
                  setLeftSearchQuery(text)
                  setLeftSearchCursor(cursorPosition)
                },
              )}
              onKeyIntercept={handleKeyIntercept}
              placeholder="Search routes..."
              focused={activePane === 'left'}
              maxHeight={1}
              minHeight={1}
              cursorPosition={Math.min(leftSearchCursor, leftSearchQuery.length)}
            />
          </box>

          <box
            style={{
              flexDirection: 'column',
              borderStyle: 'single',
              borderColor: activePane === 'left' ? theme.primary : theme.border,
              flexGrow: 1,
              flexShrink: 1,
              overflow: 'hidden',
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <SelectableList
              items={filteredRoutes.slice(0, LAYOUT.MAX_RENDERED_ITEMS)}
              focusedIndex={leftFocusedIndex}
              onSelect={() => {}}
              onFocusChange={() => {}}
              emptyMessage="No matching routes"
            />
          </box>
        </box>

        {/* RIGHT PANEL: Dynamic Config & Selection Panel */}
        <box
          style={{
            flexDirection: 'column',
            width: '55%',
            flexGrow: 1,
            flexShrink: 1,
          }}
        >
          <text style={{ fg: activePane === 'right' ? theme.primary : theme.muted, attributes: TextAttributes.BOLD, marginBottom: 0 }}>
            {activePane === 'right' ? '▶ Configuration Detail' : '  Configuration Detail'}
          </text>

          {/* Active Route Status Card */}
          <box
            style={{
              flexDirection: 'column',
              backgroundColor: theme.surface,
              paddingLeft: 1,
              paddingRight: 1,
              borderStyle: 'single',
              borderColor: theme.border,
              flexShrink: 0,
              marginBottom: 1,
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <text style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>
              Active Target: {activeRouteLabel}
            </text>
            <text style={{ fg: theme.foreground }}>
              Model: <span style={{ fg: theme.primary }}>{activeModelDisplay}</span>
            </text>
            <text style={{ fg: theme.foreground }}>
              Reasoning: <span style={{ fg: theme.primary }}>{activeReasoningDisplay}</span>
            </text>
          </box>

          {/* Right Panel searchable list */}
          {activePane === 'right' && (
            <box style={{ flexShrink: 0, marginBottom: 0 }}>
              <MultilineInput
                value={rightSearchQuery}
                onChange={({ text, cursorPosition }) => {
                  setRightSearchQuery(text)
                  setRightSearchCursor(cursorPosition)
                }}
                onSubmit={() => {}}
                onPaste={createTextPasteHandler(
                  rightSearchQuery,
                  Math.min(rightSearchCursor, rightSearchQuery.length),
                  ({ text, cursorPosition }) => {
                    setRightSearchQuery(text)
                    setRightSearchCursor(cursorPosition)
                  },
                )}
                onKeyIntercept={handleKeyIntercept}
                placeholder={rightView === 'model-select' ? "Search models..." : "Search reasoning..."}
                focused={activePane === 'right'}
                maxHeight={1}
                minHeight={1}
                cursorPosition={Math.min(rightSearchCursor, rightSearchQuery.length)}
              />
            </box>
          )}

          <box
            style={{
              flexDirection: 'column',
              borderStyle: 'single',
              borderColor: activePane === 'right' ? theme.primary : theme.border,
              flexGrow: 1,
              flexShrink: 1,
              overflow: 'hidden',
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <SelectableList
              items={rightItems.slice(0, LAYOUT.MAX_RENDERED_ITEMS)}
              focusedIndex={rightFocusedIndex}
              onSelect={() => {}}
              onFocusChange={() => {}}
              emptyMessage={rightEmptyMessage}
            />
          </box>
        </box>
      </box>

      {/* Footer bar */}
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.border,
          flexShrink: 0,
          backgroundColor: theme.surface,
          marginTop: 1,
        }}
        border={['top']}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: terminalWidth - LAYOUT.CONTENT_PADDING,
          }}
        >
          <text style={{ fg: theme.muted }}>{helpText}</text>
          <Button
            onClick={onClose}
            style={{
              paddingLeft: 2,
              paddingRight: 2,
              borderStyle: 'single',
              borderColor: theme.muted,
            }}
            border={['top', 'bottom', 'left', 'right']}
          >
            <text style={{ fg: theme.muted }}>Close</text>
          </Button>
        </box>
      </box>
    </box>
  )
}
