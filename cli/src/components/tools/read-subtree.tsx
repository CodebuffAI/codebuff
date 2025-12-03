import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

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

    // Render a single bullet line like the Read tool
    return {
      content: (
        <SimpleToolCallItem name="List deeply" description={finalPath} />
      ),
    }
  },
})
