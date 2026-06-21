import { memo } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { renderMarkdown, type MarkdownPalette } from '../../utils/markdown-renderer'
import { BORDER_CHARS } from '../../utils/ui-constants'
import { BuildModeButtons } from '../build-mode-buttons'

import type { PlanArtifactMetadata } from '../../types/chat'

interface PlanBoxProps {
  planContent: string
  metadata?: PlanArtifactMetadata
  availableWidth: number
  markdownPalette: MarkdownPalette
  onBuildFast: () => void
}

const formatMetadataRows = (metadata: PlanArtifactMetadata): string[] => {
  const artifactRows = [
    ['Session', metadata.sessionPath],
    ['SPEC.md', metadata.specPath],
    ['PLAN.md', metadata.planPath],
    ['STATUS.md', metadata.statusPath],
    ['LESSONS.md', metadata.lessonsPath],
  ]
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(([label, value]) => `${label}: ${value}`)

  const commandRows = [
    metadata.resumeCommand,
    metadata.updateCommand,
    metadata.statusCommand,
    metadata.lessonsCommand,
  ].filter((command): command is string => Boolean(command))

  return [...artifactRows, ...commandRows]
}

export const PlanBox = memo(
  ({
    planContent,
    metadata,
    availableWidth,
    markdownPalette,
    onBuildFast,
  }: PlanBoxProps) => {
    const theme = useTheme()
    const metadataRows = metadata ? formatMetadataRows(metadata) : []

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
        {metadataRows.length > 0 && (
          <box style={{ flexDirection: 'column', gap: 0 }}>
            <text style={{ fg: theme.secondary }}>Artifacts</text>
            {metadataRows.map((row) => (
              <text key={row} style={{ wrapMode: 'word', fg: theme.secondary }}>
                {row}
              </text>
            ))}
          </box>
        )}
        <BuildModeButtons theme={theme} onBuildFast={onBuildFast} />
      </box>
    )
  },
)

