import { TextAttributes } from '@opentui/core'
import { useCallback, useState } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'

/** Minimum terminal width to reveal the full prompt preview on hover */
const MIN_WIDTH_FOR_DESCRIPTION = 80
/** Gap between the label column and the hover preview so they never touch */
const LABEL_DESCRIPTION_GAP = 2

export interface SuggestedPrompt {
  /** Short text shown on the chip */
  label: string
  /** Full prompt submitted to the agent when clicked */
  prompt: string
}

/** Metadata passed alongside the prompt when a suggestion is chosen */
export interface SuggestedPromptSelection {
  label: string
  index: number
}

/**
 * First-time onboarding prompts. Kept short and broadly useful so a brand-new
 * user can get a feel for what the agent does with a single click.
 */
export const DEFAULT_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    label: 'Explain this codebase',
    prompt:
      'Give me a high-level overview of how this codebase is structured and what the main parts do.',
  },
  {
    label: 'Find opportunities to refactor',
    prompt:
      'Look through my codebase for opportunities to refactor and simplify, and suggest the highest-impact ones.',
  },
  {
    label: 'Improve my test coverage',
    prompt:
      'Analyze my test coverage and tell me where adding tests would have the most impact.',
  },
]

interface SuggestedPromptLineProps {
  prompt: SuggestedPrompt
  index: number
  isHovered: boolean
  onSelect: (prompt: string, selection: SuggestedPromptSelection) => void
  onHover: (label: string | null) => void
  /** Fixed width of the label column so hover previews align across rows */
  labelColumnWidth: number
}

const SuggestedPromptLine = ({
  prompt,
  index,
  isHovered,
  onSelect,
  onHover,
  labelColumnWidth,
}: SuggestedPromptLineProps) => {
  const theme = useTheme()
  const { terminalWidth } = useTerminalDimensions()

  const handleClick = useCallback(
    () => onSelect(prompt.prompt, { label: prompt.label, index }),
    [onSelect, prompt.prompt, prompt.label, index],
  )
  const handleMouseOver = useCallback(
    () => onHover(prompt.label),
    [onHover, prompt.label],
  )
  const handleMouseOut = useCallback(() => onHover(null), [onHover])

  const iconColor = isHovered ? theme.primary : theme.muted
  const labelColor = isHovered ? theme.primary : theme.foreground

  // On hover, reveal the full prompt that will be sent so the short chip label
  // doesn't hide what actually happens. Only when there's room for it.
  const showDescription =
    isHovered && terminalWidth >= MIN_WIDTH_FOR_DESCRIPTION
  const labelLength = '→ '.length + prompt.label.length
  const paddingSpaces = showDescription
    ? ' '.repeat(Math.max(0, labelColumnWidth - labelLength))
    : ''
  const truncatedPrompt = showDescription
    ? (() => {
        const availableWidth = Math.max(0, terminalWidth - labelColumnWidth - 4)
        return prompt.prompt.length > availableWidth
          ? prompt.prompt.slice(0, availableWidth - 1) + '…'
          : prompt.prompt
      })()
    : ''

  return (
    <box style={{ flexDirection: 'row', width: '100%' }}>
      {/* Only the label itself is clickable */}
      <Button
        onClick={handleClick}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        style={{
          flexShrink: 0,
          flexGrow: 0,
          backgroundColor: isHovered ? theme.surface : undefined,
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={iconColor}>→</span>
          <span
            fg={labelColor}
            attributes={isHovered ? TextAttributes.BOLD : undefined}
          >
            {' '}
            {prompt.label}
          </span>
        </text>
      </Button>
      {/* Non-clickable preview of the full prompt, aligned via padding */}
      {showDescription && (
        <box style={{ flexGrow: 1 }}>
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.muted} attributes={TextAttributes.ITALIC}>
              {paddingSpaces}
              {truncatedPrompt}
            </span>
          </text>
        </box>
      )}
    </box>
  )
}

interface SuggestedPromptsProps {
  onSelect: (prompt: string, selection: SuggestedPromptSelection) => void
  /** Limit the number of suggestions shown (e.g. on short terminals) */
  maxItems?: number
  prompts?: SuggestedPrompt[]
}

/**
 * A small block of clickable starter prompts shown to first-time users on an
 * empty chat, just above the input box. Clicking one submits it immediately.
 */
export const SuggestedPrompts = ({
  onSelect,
  maxItems,
  prompts = DEFAULT_SUGGESTED_PROMPTS,
}: SuggestedPromptsProps) => {
  const theme = useTheme()
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null)

  const items =
    maxItems != null ? prompts.slice(0, Math.max(0, maxItems)) : prompts

  if (items.length === 0) return null

  // Shared label-column width so the hover previews line up across rows, plus
  // a gap so the preview never touches even the longest label.
  const labelColumnWidth =
    Math.max(...items.map((p) => '→ '.length + p.label.length)) +
    LABEL_DESCRIPTION_GAP

  return (
    <box style={{ flexDirection: 'column', paddingLeft: 1, paddingBottom: 1 }}>
      <text style={{ fg: theme.muted }}>Try one of these:</text>
      {items.map((prompt, index) => (
        <SuggestedPromptLine
          key={prompt.label}
          prompt={prompt}
          index={index}
          isHovered={hoveredLabel === prompt.label}
          onSelect={onSelect}
          onHover={setHoveredLabel}
          labelColumnWidth={labelColumnWidth}
        />
      ))}
    </box>
  )
}
