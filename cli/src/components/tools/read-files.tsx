import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for read_files tool.
 * Displays all file paths as comma-separated list.
 * Does not support expand/collapse - always shows as a simple list.
 */
export const ReadFilesComponent = defineToolComponent({
  toolName: 'read_files',

  render(toolBlock): ToolRenderConfig {
    const input = toolBlock.input as any

    // Extract file paths from input
    const filePaths: string[] = Array.isArray(input?.paths)
      ? input.paths
          .filter((path: any) => typeof path === 'string')
          .map((path: string) => path.trim())
          .filter((path: string) => path.length > 0)
      : []

    if (filePaths.length === 0) {
      return { content: null }
    }

    return {
      content: (
        <SimpleToolCallItem name="Read" description={filePaths.join(', ')} />
      ),
    }
  },
})
