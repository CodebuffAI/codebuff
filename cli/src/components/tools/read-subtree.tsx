import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { getToolOutputValues } from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig } from './types'

/**
 * UI component for read_subtree tool.
 * Render a single-line summary like other simple tools
 * (e.g., Read, List) without an extra collapsible header.
 */
export const ReadSubtreeComponent = defineToolComponent({
  toolName: 'read_subtree',

  render(toolBlock): ToolRenderConfig {
    const input = toolBlock.input as any
    const paths: string[] = Array.isArray(input?.paths)
      ? input.paths.filter((p: any) => typeof p === 'string' && p.trim().length)
      : []

    const displayPath: string =
      typeof input?.path === 'string' && input.path.trim().length > 0
        ? input.path.trim()
        : paths[0] || ''

    const finalPath = displayPath || '.'
    const entries = getToolOutputValues(toolBlock.outputRaw).flatMap((value) =>
      Array.isArray(value) ? value : [],
    ) as Array<Record<string, unknown>>
    const failures = entries.filter(
      (entry) => typeof entry.errorMessage === 'string',
    )
    const truncated = entries.filter(
      (entry) =>
        entry.liveScanTruncated === true ||
        (typeof entry.truncationLevel === 'string' &&
          entry.truncationLevel !== 'none'),
    )
    const statusName =
      toolBlock.lifecycle === 'cancelled'
        ? 'Subtree cancelled'
        : failures.length === entries.length && entries.length > 0
          ? 'Subtree failed'
          : failures.length > 0 || truncated.length > 0
            ? 'Subtree partial'
            : 'List deeply'

    // Use a wrapper component to access theme
    const ReadSubtreeContent = () => {
      const theme = useTheme()
      return (
        <SimpleToolCallItem
          name={statusName}
          description={
            failures[0]?.errorMessage
              ? `${finalPath} · ${String(failures[0].errorMessage)}`
              : truncated[0]?.recovery
                ? `${finalPath} · ${String(truncated[0].recovery)}`
                : finalPath
          }
          descriptionColor={theme.directory}
        />
      )
    }

    return {
      content: <ReadSubtreeContent />,
    }
  },
})
