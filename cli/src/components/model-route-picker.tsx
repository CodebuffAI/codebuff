import { TextAttributes } from '@opentui/core'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './button'
import { MultilineInput } from './multiline-input'
import { SelectableList } from './selectable-list'
import { useSearchableList } from '../hooks/use-searchable-list'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import {
  getEditableConfig,
  getKnownModelOptions,
  setRouteModel,
  writeMergedConfig,
} from '../utils/openbuff-provider'

import type { SelectableListItem } from './selectable-list'
import type { ModelRouteTarget } from '../utils/openbuff-provider'
import type { OpenbuffReasoningEffort } from '@codebuff/sdk'

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

interface RouteItem {
  id: string
  label: string
  secondary: string
  target?: ModelRouteTarget
  currentModel: string | undefined
  isHeader?: boolean
}

interface ModelRoutePickerProps {
  onClose: () => void
  onConfigUpdated?: () => void
}

type PickerView = 'route-list' | 'model-select'

const isHeaderItem = (item: SelectableListItem | undefined): boolean =>
  item?.id.startsWith('section-') ?? false

const firstSelectableIndex = (items: SelectableListItem[]): number => {
  const index = items.findIndex((item) => !isHeaderItem(item))
  return index === -1 ? 0 : index
}

/**
 * Filter out section headers that have no visible child routes.
 *
 * When the user types a search query, a header can match while none of its
 * children do — producing a list where the only visible item is a header
 * and Enter is a no-op. This helper drops orphan headers from the filtered
 * result so focus always lands on a selectable route.
 */
function filterOrphanHeaders(filtered: SelectableListItem[]): SelectableListItem[] {
  const routeIds = new Set(
    filtered
      .filter((item) => !isHeaderItem(item))
      .map((item) => item.id),
  )

  // Map each header to the set of route prefix patterns it owns.
  const headerPrefixes = new Map<string, string[]>([
    ['section-default', ['route-default']],
    ['section-modes', ['route-mode-']],
    ['section-editor', ['route-editor-']],
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

  const contentWidth = terminalWidth - LAYOUT.CONTENT_PADDING
  const isCompactMode = terminalHeight < LAYOUT.COMPACT_MODE_THRESHOLD

  const [view, setView] = useState<PickerView>('route-list')
  const [selectedRoute, setSelectedRoute] = useState<RouteItem | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [configKey, setConfigKey] = useState(0) // Force refresh after writes

  // Load current config
  const config = useMemo(() => {
    // Use configKey as dependency to force re-read after writes
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
      isHeader: true,
    })

    // Default model
    items.push({
      id: 'route-default',
      label: 'default',
      secondary: displayModel(config.defaultModel) ?? '(not set)',
      target: { type: 'default' },
      currentModel: displayModel(config.defaultModel) ?? undefined,
    })

    items.push({
      id: 'section-modes',
      label: 'Modes',
      secondary: '',
      currentModel: undefined,
      isHeader: true,
    })

    // Modes
    const modes: Array<'default' | 'lite' | 'max' | 'plan'> = [
      'default',
      'lite',
      'max',
      'plan',
    ]
    for (const mode of modes) {
      const model = displayModel(config.modes?.[mode])
      items.push({
        id: `route-mode-${mode}`,
        label: `mode:${mode}`,
        secondary: model ?? '(not set)',
        target: { type: 'mode', mode },
        currentModel: model ?? undefined,
      })
    }

    items.push({
      id: 'section-editor',
      label: 'Editor multi-prompt',
      secondary: '',
      currentModel: undefined,
      isHeader: true,
    })

    // Editor multi-prompt
    const proposalModels = config.editorMultiPrompt?.proposalModels ?? []
    for (let i = 0; i < 5; i++) {
      const model = displayModel(proposalModels[i])
      items.push({
        id: `route-editor-proposal-${i + 1}`,
        label: `editor:proposal-${i + 1}`,
        secondary: model ?? '(not set)',
        target: { type: 'editor-proposal', proposalNumber: i + 1 },
        currentModel: model ?? undefined,
      })
    }
    items.push({
      id: 'route-editor-selector',
      label: 'editor:selector',
      secondary:
        displayModel(config.editorMultiPrompt?.selectorModel) ?? '(not set)',
      target: { type: 'editor-selector' },
      currentModel:
        displayModel(config.editorMultiPrompt?.selectorModel) ?? undefined,
    })

    items.push({
      id: 'section-agents',
      label: 'Agent overrides',
      secondary: '',
      currentModel: undefined,
      isHeader: true,
    })

    // Agent overrides (excluding editor multi-prompt agents)
    const editorAgentPrefixes = [
      'editor-implementor-proposal-',
      'best-of-n-selector2',
    ]
    for (const [agentId, model] of Object.entries(config.agents ?? {})) {
      if (editorAgentPrefixes.some((prefix) => agentId.startsWith(prefix))) {
        continue
      }
      items.push({
        id: `route-agent-${agentId}`,
        label: `agent:${agentId}`,
        secondary: displayModel(model) ?? '(not set)',
        target: { type: 'agent', agentId },
        currentModel: displayModel(model) ?? undefined,
      })
    }

    return items
  }, [config])

  // Convert to SelectableListItem format
  const selectableRouteItems: SelectableListItem[] = useMemo(
    () =>
      routeItems.map((route) => ({
        id: route.id,
        label: route.isHeader ? route.label : `${route.label} → ${route.secondary}`,
        icon: route.isHeader ? '' : route.currentModel ? '✓' : '○',
        secondary: route.secondary,
        hideSecondary: true,
        accent: route.isHeader,
      })),
    [routeItems],
  )

  // Filter routes by search query (matches label or secondary)
  const filterRoutes = useCallback(
    (item: SelectableListItem, query: string) => {
      const q = query.toLowerCase()
      return (
        item.label.toLowerCase().includes(q) ||
        (item.secondary ?? '').toLowerCase().includes(q)
      )
    },
    [],
  )

  const {
    searchQuery,
    setSearchQuery,
    focusedIndex,
    setFocusedIndex,
    filteredItems: rawFilteredRoutes,
    handleFocusChange,
  } = useSearchableList({
    items: selectableRouteItems,
    filterFn: filterRoutes,
  })

  const filteredRoutes = useMemo(
    () => filterOrphanHeaders(rawFilteredRoutes),
    [rawFilteredRoutes],
  )

  // Available models for selection
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

  const filterModels = useCallback(
    (item: SelectableListItem, query: string) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    [],
  )

  const {
    searchQuery: modelSearchQuery,
    setSearchQuery: setModelSearchQuery,
    focusedIndex: modelFocusedIndex,
    setFocusedIndex: setModelFocusedIndex,
    filteredItems: filteredModels,
    handleFocusChange: handleModelFocusChange,
  } = useSearchableList({
    items: selectableModelItems,
    filterFn: filterModels,
  })

  // Reset focus when switching views
  useEffect(() => {
    if (view === 'route-list') {
      setFocusedIndex(firstSelectableIndex(filteredRoutes))
      setModelSearchQuery('')
      setModelFocusedIndex(0)
    } else {
      setModelFocusedIndex(0)
    }
  }, [
    view,
    filteredRoutes,
    setFocusedIndex,
    setModelSearchQuery,
    setModelFocusedIndex,
  ])

  const handleRouteSelect = useCallback(
    (item: SelectableListItem) => {
      const route = routeItems.find((r) => r.id === item.id)
      if (!route || route.isHeader || !route.target) return
      setSelectedRoute(route)
      setModelSearchQuery('')
      setModelFocusedIndex(0)
      setView('model-select')
    },
    [routeItems, setModelSearchQuery, setModelFocusedIndex],
  )

  useEffect(() => {
    return () => {
      if (statusClearTimerRef.current) {
        clearTimeout(statusClearTimerRef.current)
      }
    }
  }, [])

  const handleModelSelect = useCallback(
    (item: SelectableListItem) => {
      if (!selectedRoute?.target) return

      try {
        const editableConfig = getEditableConfig()
        setRouteModel(editableConfig, selectedRoute.target, item.id)
        const configPath = writeMergedConfig(editableConfig)
        const msg = `✓ ${selectedRoute.label} → ${item.id}  (saved to ${configPath})`
        setStatusMessage(msg)
        if (statusClearTimerRef.current) {
          clearTimeout(statusClearTimerRef.current)
        }
        statusClearTimerRef.current = setTimeout(() => {
          setStatusMessage((current) => (current === msg ? null : current))
        }, 4000)
        setConfigKey((k) => k + 1)
        setView('route-list')
        setSelectedRoute(null)
        onConfigUpdated?.()
      } catch (error) {
        setStatusMessage(
          `✗ ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [selectedRoute, onConfigUpdated],
  )

  const handleKeyIntercept = useCallback(
    (key: { name?: string; shift?: boolean; ctrl?: boolean }) => {
      if (view === 'route-list') {
        if (key.name === 'escape') {
          if (searchQuery.length > 0) {
            setSearchQuery('')
            return true
          }
          onClose()
          return true
        }
        if (key.name === 'up') {
          setFocusedIndex((prev) => nextSelectableIndex(filteredRoutes, prev, -1))
          return true
        }
        if (key.name === 'down') {
          setFocusedIndex((prev) => nextSelectableIndex(filteredRoutes, prev, 1))
          return true
        }
        if (key.name === 'return' || key.name === 'enter') {
          const focused = filteredRoutes[focusedIndex]
          if (focused && !isHeaderItem(focused)) {
            handleRouteSelect(focused)
          }
          return true
        }
      } else {
        // model-select view
        if (key.name === 'escape') {
          if (modelSearchQuery.length > 0) {
            setModelSearchQuery('')
            return true
          }
          setView('route-list')
          setSelectedRoute(null)
          return true
        }
        if (key.name === 'up') {
          setModelFocusedIndex((prev) => Math.max(0, prev - 1))
          return true
        }
        if (key.name === 'down') {
          if (filteredModels.length === 0) return true
          const maxIndex = filteredModels.length - 1
          setModelFocusedIndex((prev) => Math.min(maxIndex, prev + 1))
          return true
        }
        if (key.name === 'return' || key.name === 'enter') {
          const focused = filteredModels[modelFocusedIndex]
          if (focused) {
            handleModelSelect(focused)
          }
          return true
        }
      }
      if (key.name === 'c' && key.ctrl) {
        onClose()
        return true
      }
      return false
    },
    [
      view,
      searchQuery,
      setSearchQuery,
      onClose,
      setFocusedIndex,
      filteredRoutes,
      focusedIndex,
      handleRouteSelect,
      modelSearchQuery,
      setModelSearchQuery,
      setModelFocusedIndex,
      filteredModels,
      modelFocusedIndex,
      handleModelSelect,
    ],
  )

  const title =
    view === 'route-list'
      ? 'Model Route Configuration'
      : `Select model for ${selectedRoute?.label ?? ''}`

  const helpText =
    view === 'route-list'
      ? '↑↓ navigate · Enter change · / search · Esc close'
      : '↑↓ navigate · Enter select · / search · Esc back'

  const statusLine = statusMessage
    ? `  ${statusMessage}`
    : undefined

  const items =
    view === 'route-list'
      ? filteredRoutes.slice(0, LAYOUT.MAX_RENDERED_ITEMS)
      : filteredModels.slice(0, LAYOUT.MAX_RENDERED_ITEMS)

  const currentFocusedIndex =
    view === 'route-list' ? focusedIndex : modelFocusedIndex

  const currentSetFocusedIndex =
    view === 'route-list' ? setFocusedIndex : setModelFocusedIndex

  const currentOnSelect =
    view === 'route-list'
      ? handleRouteSelect
      : handleModelSelect

  const handleRouteFocusChange = useCallback(
    (index: number) => {
      if (isHeaderItem(filteredRoutes[index])) {
        setFocusedIndex(firstSelectableIndex(filteredRoutes))
        return
      }
      handleFocusChange(index)
    },
    [filteredRoutes, handleFocusChange, setFocusedIndex],
  )

  const currentOnFocusChange =
    view === 'route-list' ? handleRouteFocusChange : handleModelFocusChange

  const currentSearchQuery =
    view === 'route-list' ? searchQuery : modelSearchQuery

  const currentSetSearchQuery =
    view === 'route-list' ? setSearchQuery : setModelSearchQuery

  const emptyMessage =
    view === 'route-list'
      ? searchQuery
        ? 'No matching routes'
        : 'No routes configured yet.\n  /setup codex          — preset with ChatGPT/Codex subscription\n  /provider connect codex  — connect ChatGPT subscription (then use the preset)\n  /provider add         — add a provider manually'
      : modelSearchQuery
        ? 'No matching models'
        : availableModels.length === 0
          ? 'No provider models configured.\n  /setup codex          — preset with ChatGPT/Codex subscription\n  /provider connect codex  — connect ChatGPT subscription (then use the preset)\n  /provider add         — add a provider manually'
          : 'No models found'

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
      {/* Main content area */}
      <box
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: isCompactMode ? 0 : 1,
          paddingBottom: 0,
          gap: 0,
          flexGrow: 1,
          flexShrink: 1,
        }}
      >
        {/* Title */}
        {!isCompactMode && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: 1,
              marginTop: 1,
              flexShrink: 0,
            }}
          >
            <text
              style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}
            >
              {title}
            </text>
          </box>
        )}

        {/* Search input */}
        <box
          style={{
            width: contentWidth,
            flexShrink: 0,
            marginBottom: 0,
          }}
        >
          <MultilineInput
            value={currentSearchQuery}
            onChange={({ text }) => currentSetSearchQuery(text)}
            onSubmit={() => {}}
            onPaste={() => {}}
            onKeyIntercept={handleKeyIntercept}
            placeholder="Search..."
            focused={true}
            maxHeight={1}
            minHeight={1}
            cursorPosition={currentSearchQuery.length}
          />
        </box>

        {/* List - grows to fill remaining space */}
        <box
          style={{
            flexDirection: 'column',
            width: contentWidth,
            borderStyle: 'single',
            borderColor: theme.muted,
            flexGrow: 1,
            flexShrink: 1,
            overflow: 'hidden',
          }}
          border={['top', 'bottom', 'left', 'right']}
        >
          <SelectableList
            items={items}
            focusedIndex={currentFocusedIndex}
            onSelect={currentOnSelect}
            onFocusChange={currentOnFocusChange}
            emptyMessage={emptyMessage}
          />
        </box>
      </box>

      {/* Bottom bar */}
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          paddingTop: 0,
          paddingBottom: 0,
          borderStyle: 'single',
          borderColor: theme.border,
          flexShrink: 0,
          backgroundColor: theme.surface,
        }}
        border={['top']}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: contentWidth,
          }}
        >
          {/* Help text and status */}
          <box style={{ flexGrow: 1, flexShrink: 1, flexDirection: 'column' }}>
            <text style={{ fg: theme.muted }}>{helpText}</text>
            {statusLine && (
              <text style={{ fg: theme.primary }}>{statusLine}</text>
            )}
          </box>

          {/* Cancel button */}
          <box style={{ flexDirection: 'row', gap: 1 }}>
            <Button
              onClick={onClose}
              style={{
                paddingLeft: 2,
                paddingRight: 2,
                paddingTop: 0,
                paddingBottom: 0,
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
    </box>
  )
}
