import { memo, useState } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { renderMarkdown, type MarkdownPalette } from '../../utils/markdown-renderer'
import { BORDER_CHARS } from '../../utils/ui-constants'
import { Button } from '../button'
import { BuildModeButtons } from '../build-mode-buttons'

import type { PlanArtifactMetadata } from '../../types/chat'

interface PlanBoxProps {
  planContent: string
  metadata?: PlanArtifactMetadata
  availableWidth: number
  markdownPalette: MarkdownPalette
  onBuildFast: () => void
  /** Insert a command into the chat input (no submit). Defaults to noop so existing tests can omit it. */
  onInsertCommand?: (command: string) => void
}

/** Known artifact paths (Session, SPEC/PLAN/STATUS/LESSONS) + custom artifacts. Rendered as static text. */
const formatArtifactRows = (metadata: PlanArtifactMetadata): string[] => {
  const artifactRows = [
    ['Session', metadata.sessionPath],
    ['SPEC.md', metadata.specPath],
    ['PLAN.md', metadata.planPath],
    ['STATUS.md', metadata.statusPath],
    ['LESSONS.md', metadata.lessonsPath],
  ]
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(([label, value]) => `${label}: ${value}`)

  const customArtifactRows = (metadata.customArtifacts ?? []).map(
    ({ label, path }) => `${label}: ${path}`,
  )

  return [...artifactRows, ...customArtifactRows]
}

/** Command strings (build/maintain this plan) rendered as clickable buttons. */
const formatCommandRows = (metadata: PlanArtifactMetadata): string[] =>
  [
    metadata.executeCommand,
    metadata.resumeCommand,
    metadata.updateCommand,
    metadata.statusCommand,
    metadata.lessonsCommand,
    ...(metadata.customArtifactCommands ?? []),
  ].filter((command): command is string => Boolean(command))

export const PlanBox = memo(
  ({
    planContent,
    metadata,
    availableWidth,
    markdownPalette,
    onBuildFast,
    onInsertCommand = () => {},
  }: PlanBoxProps) => {
    const theme = useTheme()
    const artifactRows = metadata ? formatArtifactRows(metadata) : []
    const commandRows = metadata ? formatCommandRows(metadata) : []
    const hasMetadata = artifactRows.length > 0 || commandRows.length > 0
    // Track which command is hovered so each button highlights independently.
    const [hoveredCommand, setHoveredCommand] = useState<string | null>(null)

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 1,
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.secondary,
          customBorderChars: BORDER_CHARS,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 1,
        }}
      >
        <text style={{ wrapMode: 'word', fg: theme.foreground }}>
          {renderMarkdown(planContent, {
            codeBlockWidth: Math.max(10, availableWidth - 8),
            palette: markdownPalette,
          })}
        </text>
        {hasMetadata && (
          <box style={{ flexDirection: 'column', gap: 0 }}>
            <text style={{ fg: theme.secondary }}>Artifacts</text>
            {artifactRows.map((row) => (
              <text key={row} style={{ wrapMode: 'word', fg: theme.secondary }}>
                {row}
              </text>
            ))}
            {commandRows.map((command) => (
              <Button
                key={command}
                style={{
                  flexDirection: 'row',
                  paddingLeft: 1,
                  paddingRight: 1,
                  borderStyle: 'single',
                  borderColor:
                    hoveredCommand === command ? theme.foreground : theme.secondary,
                  customBorderChars: BORDER_CHARS,
                }}
                onClick={() => onInsertCommand(command)}
                onMouseOver={() => setHoveredCommand(command)}
                onMouseOut={() => setHoveredCommand((current) =>
                  current === command ? null : current,
                )}
              >
                <text wrapMode="none" style={{ fg: theme.secondary }}>
                  {command}
                </text>
              </Button>
            ))}
          </box>
        )}
        <BuildModeButtons theme={theme} onBuildFast={onBuildFast} />
      </box>
    )
  },
)

