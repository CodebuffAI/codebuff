import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { MultilineInput } from './multiline-input'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { useTheme } from '../hooks/use-theme'
import { getSystemProcessEnv } from '../utils/env'
import { createTextPasteHandler } from '../utils/strings'

import type { KeyEvent } from '@opentui/core'

export type ProviderPickerPresetId =
  | 'opencode-go'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'codex'
  | 'glm'
  | 'bedrock'
  | 'freemodel'

export type ProviderPickerSelection =
  | { type: 'preset'; preset: ProviderPickerPresetId }
  | { type: 'connect-codex' }
  | {
      type: 'custom'
      provider: {
        id: string
        type: CustomProviderType
        baseURL: string
        apiKeyEnv?: string
        models: string[]
      }
    }
  | { type: 'cancel' }

export type ProviderPickerPreset = {
  id: ProviderPickerPresetId
  label: string
  description: string
  category: 'Subscriptions' | 'API Providers'
  env?: string
  aliases?: string[]
  available?: boolean
}

const DEFAULT_PRESETS: ProviderPickerPreset[] = [
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    description: 'OpenCode Go subscription endpoint with coding-focused models.',
    env: 'OPENCODE_GO_API_KEY',
    category: 'Subscriptions',
    aliases: ['opencode', 'go', 'zai', 'glm', 'kimi', 'qwen'],
  },
  {
    id: 'codex',
    label: 'Codex / ChatGPT',
    description: 'Connect a ChatGPT subscription with the existing OAuth flow.',
    category: 'Subscriptions',
    aliases: ['chatgpt', 'chat gpt', 'oauth'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT models through OpenAI.',
    env: 'OPENAI_API_KEY',
    category: 'API Providers',
    aliases: ['gpt'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic / Claude',
    description:
      'Claude models through the native Anthropic Messages API or compatible gateways.',
    env: 'ANTHROPIC_API_KEY',
    category: 'API Providers',
    aliases: ['anthropic', 'claude', 'sonnet', 'opus'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Use any OpenRouter model with your OpenRouter API key.',
    env: 'OPENROUTER_API_KEY',
    category: 'API Providers',
    aliases: ['router', 'open router'],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local Ollama models, usually without an API key.',
    category: 'API Providers',
    aliases: ['local'],
  },
  {
    id: 'glm',
    label: 'GLM / Z.ai',
    description: 'GLM OpenAI-compatible endpoint for coding plans.',
    env: 'GLM_API_KEY',
    category: 'API Providers',
    aliases: ['zai', 'z.ai', 'bigmodel'],
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    description:
      'AWS Bedrock OpenAI-compatible endpoint. Update baseURL to your region.',
    env: 'AWS_BEARER_TOKEN_BEDROCK',
    category: 'API Providers',
    aliases: ['aws', 'amazon bedrock', 'bedrock'],
  },
  {
    id: 'freemodel',
    label: 'Free Model',
    description:
      'Free Model endpoints for GPT and Claude-compatible coding models.',
    env: 'FREEMODEL_API_KEY',
    category: 'API Providers',
    aliases: ['freemodel', 'free model', 'gpt-5.5-free'],
  },
]

type CustomProviderType = 'openai-compatible' | 'anthropic-compatible'
type EditableCustomField = 'id' | 'providerType' | 'baseURL' | 'apiKeyEnv' | 'models'
type CustomField = EditableCustomField | 'review'

type CustomProviderDraft = {
  id: string
  providerType: string
  baseURL: string
  apiKeyEnv: string
  models: string
}

type PickerItem =
  | (ProviderPickerPreset & { kind: 'preset' })
  | {
      kind: 'custom'
      id: 'custom'
      label: string
      description: string
      category: 'Custom'
      env?: undefined
      aliases: string[]
    }

type DisplayRow =
  | { type: 'header'; label: string }
  | { type: 'item'; item: PickerItem; selectableIndex: number }

type Props = {
  presets?: ProviderPickerPreset[]
  onSelect: (selection: ProviderPickerSelection) => void
}

const FIELD_LABELS: Record<EditableCustomField, string> = {
  id: 'Provider id',
  providerType: 'Provider type (openai-compatible or anthropic-compatible)',
  baseURL: 'Base URL',
  apiKeyEnv: 'API key env (blank for none)',
  models: 'Models (comma-separated)',
}

const FIELD_ORDER: EditableCustomField[] = [
  'id',
  'providerType',
  'baseURL',
  'apiKeyEnv',
  'models',
]

function providerMatches(item: PickerItem, query: string): boolean {
  const haystack = [
    item.id,
    item.label,
    item.description,
    item.env ?? '',
    ...(item.aliases ?? []),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(query.toLowerCase())
}

function normalizeModels(value: string): string[] {
  return value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
}

function normalizeCustomProviderType(value: string): CustomProviderType | null {
  const normalized = value.trim().toLowerCase()
  if (
    normalized === '1' ||
    normalized === 'openai' ||
    normalized === 'openai-compatible'
  ) {
    return 'openai-compatible'
  }
  if (
    normalized === '2' ||
    normalized === 'anthropic' ||
    normalized === 'anthropic-compatible' ||
    normalized === 'claude'
  ) {
    return 'anthropic-compatible'
  }
  return null
}

function envStatus(env: string | undefined): string | null {
  if (!env) return null
  return getSystemProcessEnv()[env] ? '✓' : '!'
}

function isEditableCustomField(field: CustomField): field is EditableCustomField {
  return field !== 'review'
}

function getPreviousCustomField(field: CustomField): CustomField {
  if (field === 'review') return 'models'
  const index = FIELD_ORDER.indexOf(field)
  return index <= 0 ? 'id' : FIELD_ORDER[index - 1]
}

function getNextCustomField(field: EditableCustomField): CustomField {
  const index = FIELD_ORDER.indexOf(field)
  return index === FIELD_ORDER.length - 1 ? 'review' : FIELD_ORDER[index + 1]
}

function canSubmitCustomProvider(provider: CustomProviderDraft): boolean {
  return Boolean(
    provider.id.trim() &&
      normalizeCustomProviderType(provider.providerType) !== null &&
      provider.baseURL.trim() &&
      normalizeModels(provider.models).length > 0,
  )
}

export function ProviderPickerScreen({ presets, onSelect }: Props) {
  const theme = useTheme()
  const { terminalWidth, terminalHeight } = useTerminalLayout()
  const contentWidth = Math.max(40, terminalWidth - 4)
  const maxRenderedRows = Math.max(6, terminalHeight - 12)

  const allPresets = presets?.length ? presets : DEFAULT_PRESETS
  const visiblePresets = allPresets.filter(
    (preset) => preset.available !== false,
  )

  const [query, setQuery] = useState('')
  const [queryCursor, setQueryCursor] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<'picker' | 'custom'>('picker')
  const [customField, setCustomField] = useState<CustomField>('id')
  const [customCursor, setCustomCursor] = useState(0)
  const [customProvider, setCustomProvider] = useState<CustomProviderDraft>({
    id: '',
    providerType: 'openai-compatible',
    baseURL: '',
    apiKeyEnv: '',
    models: '',
  })

  const filteredItems = useMemo(() => {
    const pickerItems: PickerItem[] = [
      ...visiblePresets.map((preset) => ({ ...preset, kind: 'preset' as const })),
      {
        kind: 'custom' as const,
        id: 'custom',
        label: 'Custom OpenAI/Anthropic-compatible provider',
        description:
          'Enter an id, provider type, base URL, API key environment variable, and model ids.',
        category: 'Custom' as const,
        aliases: ['custom', 'openai compatible', 'anthropic compatible', 'claude'],
      },
    ]

    const trimmedQuery = query.trim()
    return trimmedQuery
      ? pickerItems.filter((item) => providerMatches(item, trimmedQuery))
      : pickerItems
  }, [query, visiblePresets])

  const displayRows = useMemo<DisplayRow[]>(() => {
    const rows: DisplayRow[] = []
    const categories = Array.from(
      new Set(filteredItems.map((item) => item.category)),
    )
    let selectableIndex = 0

    for (const category of categories) {
      rows.push({ type: 'header', label: category })
      for (const item of filteredItems) {
        if (item.category !== category) continue
        rows.push({ type: 'item', item, selectableIndex })
        selectableIndex++
      }
    }

    return rows
  }, [filteredItems])

  const maxSelectable = filteredItems.length - 1

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, maxSelectable)))
  }, [maxSelectable])

  const selectCurrentItem = useCallback(() => {
    const selectedRow = displayRows.find(
      (row) => row.type === 'item' && row.selectableIndex === selectedIndex,
    )
    if (!selectedRow || selectedRow.type !== 'item') return

    const item = selectedRow.item
    if (item.kind === 'custom') {
      setMode('custom')
      setCustomField('id')
      setCustomCursor(customProvider.id.length)
      return
    }
    if (item.id === 'codex') {
      onSelect({ type: 'connect-codex' })
      return
    }
    onSelect({ type: 'preset', preset: item.id })
  }, [customProvider.id.length, displayRows, onSelect, selectedIndex])

  const handlePickerKey = useCallback(
    (key: KeyEvent): boolean => {
      if (mode !== 'picker') return false

      if (key.name === 'escape') {
        key.preventDefault()
        if (query.length > 0) {
          setQuery('')
          setQueryCursor(0)
          setSelectedIndex(0)
        } else {
          onSelect({ type: 'cancel' })
        }
        return true
      }
      if (key.name === 'q' && query.length === 0) {
        key.preventDefault()
        onSelect({ type: 'cancel' })
        return true
      }
      if (key.name === 'up') {
        key.preventDefault()
        setSelectedIndex((index) => Math.max(0, index - 1))
        return true
      }
      if (key.name === 'down') {
        key.preventDefault()
        setSelectedIndex((index) => Math.min(maxSelectable, index + 1))
        return true
      }
      return false
    },
    [maxSelectable, mode, onSelect, query.length],
  )

  const submitCustomValue = useCallback(() => {
    if (!isEditableCustomField(customField)) return
    const nextField = getNextCustomField(customField)
    setCustomField(nextField)
    setCustomCursor(nextField === 'review' ? 0 : customProvider[nextField].length)
  }, [customField, customProvider])

  const handleCustomKey = useCallback(
    (key: KeyEvent): boolean => {
      if (mode !== 'custom') return false

      if (key.name === 'escape') {
        key.preventDefault()
        if (customField === 'id') {
          setMode('picker')
          setCustomProvider({
            id: '',
            providerType: 'openai-compatible',
            baseURL: '',
            apiKeyEnv: '',
            models: '',
          })
          setCustomCursor(0)
          return true
        }
        const previousField = getPreviousCustomField(customField)
        setCustomField(previousField)
        setCustomCursor(
          previousField === 'review' ? 0 : customProvider[previousField].length,
        )
        return true
      }

      if (customField !== 'review') return false

      if (key.name === 'return' || key.name === 'enter' || key.name === 'y') {
        key.preventDefault()
        const models = normalizeModels(customProvider.models)
        const providerType = normalizeCustomProviderType(customProvider.providerType)
        if (!providerType || !canSubmitCustomProvider(customProvider)) return true
        onSelect({
          type: 'custom',
          provider: {
            id: customProvider.id.trim(),
            type: providerType,
            baseURL: customProvider.baseURL.trim(),
            apiKeyEnv: customProvider.apiKeyEnv.trim() || undefined,
            models,
          },
        })
        return true
      }
      if (key.name === 'n') {
        key.preventDefault()
        setCustomField('models')
        setCustomCursor(customProvider.models.length)
        return true
      }
      return false
    },
    [customField, customProvider, mode, onSelect],
  )

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (mode === 'custom' && customField === 'review') {
          handleCustomKey(key)
        }
      },
      [customField, handleCustomKey, mode],
    ),
  )

  if (mode === 'custom') {
    const currentField = isEditableCustomField(customField) ? customField : null
    const currentValue = currentField ? customProvider[currentField] : ''
    const canSubmit = canSubmitCustomProvider(customProvider)

    return (
      <box
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: theme.surface,
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 1,
          flexDirection: 'column',
        }}
      >
        <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
          Add custom OpenAI/Anthropic-compatible provider
        </text>
        <text style={{ fg: theme.muted }}>Esc goes back one step.</text>
        <box style={{ height: 1 }} />
        <text style={{ fg: theme.foreground }}>ID: {customProvider.id || '—'}</text>
        <text style={{ fg: theme.foreground }}>
          Type: {customProvider.providerType}
        </text>
        <text style={{ fg: theme.foreground }}>
          Base URL: {customProvider.baseURL || '—'}
        </text>
        <text style={{ fg: theme.foreground }}>
          API key env: {customProvider.apiKeyEnv || 'none'}
        </text>
        <text style={{ fg: theme.foreground }}>
          Models: {customProvider.models || '—'}
        </text>
        <box style={{ height: 1 }} />
        {currentField ? (
          <box style={{ width: contentWidth, flexDirection: 'column' }}>
            <text style={{ fg: theme.success }}>{FIELD_LABELS[currentField]}:</text>
            <MultilineInput
              value={currentValue}
              onChange={({ text, cursorPosition }) => {
                setCustomProvider((provider) => ({
                  ...provider,
                  [currentField]: text,
                }))
                setCustomCursor(cursorPosition)
              }}
              onSubmit={submitCustomValue}
              onPaste={createTextPasteHandler(
                currentValue,
                customCursor,
                ({ text, cursorPosition }) => {
                  setCustomProvider((provider) => ({
                    ...provider,
                    [currentField]: text,
                  }))
                  setCustomCursor(cursorPosition)
                },
              )}
              onKeyIntercept={handleCustomKey}
              placeholder={FIELD_LABELS[currentField]}
              focused={true}
              maxHeight={1}
              minHeight={1}
              cursorPosition={customCursor}
            />
          </box>
        ) : (
          <box style={{ flexDirection: 'column' }}>
            <text style={{ fg: canSubmit ? theme.success : theme.error }}>
              {canSubmit
                ? 'Press Enter or y to save this provider.'
                : 'Provider id, provider type, base URL, and at least one model are required.'}
            </text>
            <text style={{ fg: theme.muted }}>Press n to edit, Esc to go back.</text>
          </box>
        )}
        <box style={{ marginTop: 1 }}>
          <text style={{ fg: theme.muted }}>Esc back · Enter submit</text>
        </box>
      </box>
    )
  }

  const renderedRows = displayRows.slice(0, maxRenderedRows)

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.surface,
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
        Add Provider
      </text>
      <text style={{ fg: theme.muted }}>
        Search providers, use ↑/↓, Enter to select, Esc to cancel.
      </text>
      <box style={{ height: 1 }} />
      <box style={{ width: contentWidth }}>
        <MultilineInput
          value={query}
          onChange={({ text, cursorPosition }) => {
            setQuery(text)
            setQueryCursor(cursorPosition)
            setSelectedIndex(0)
          }}
          onSubmit={selectCurrentItem}
          onPaste={createTextPasteHandler(
            query,
            queryCursor,
            ({ text, cursorPosition }) => {
              setQuery(text)
              setQueryCursor(cursorPosition)
              setSelectedIndex(0)
            },
          )}
          onKeyIntercept={handlePickerKey}
          placeholder="Search providers..."
          focused={true}
          maxHeight={1}
          minHeight={1}
          cursorPosition={queryCursor}
        />
      </box>
      <box style={{ height: 1 }} />
      <box
        style={{
          width: contentWidth,
          borderStyle: 'single',
          borderColor: theme.muted,
          flexDirection: 'column',
          flexGrow: 1,
          overflow: 'hidden',
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        {renderedRows.length === 0 ? (
          <text style={{ fg: theme.muted }}>No providers match “{query}”.</text>
        ) : (
          renderedRows.map((row, index) => {
            if (row.type === 'header') {
              return (
                <text
                  key={`header-${row.label}-${index}`}
                  style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}
                >
                  {row.label}
                </text>
              )
            }

            const selected = row.selectableIndex === selectedIndex
            const item = row.item
            const status = envStatus(item.env)
            const envSuffix = item.env ? `  env: ${item.env} ${status}` : ''
            return (
              <box key={item.id} style={{ flexDirection: 'column' }}>
                <text
                  style={{
                    fg: selected ? theme.primary : theme.foreground,
                    attributes: selected ? TextAttributes.BOLD : undefined,
                  }}
                >
                  {selected ? '› ' : '  '}
                  {item.label}
                  <span style={{ fg: theme.muted }}>{envSuffix}</span>
                </text>
                <text style={{ fg: theme.muted }}>    {item.description}</text>
              </box>
            )
          })
        )}
      </box>
      <box style={{ marginTop: 1 }}>
        <text style={{ fg: theme.muted }}>↑↓ navigate · Enter select · Esc cancel</text>
      </box>
    </box>
  )
}

export default ProviderPickerScreen
