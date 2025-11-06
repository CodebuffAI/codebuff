import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'
import { SimpleToolCallItem } from './tool-call-item'

/**
 * UI component for read_subtree tool.
 * Displays paths from the output with first few on newlines, rest inline.
 * Does not support expand/collapse - always shows as a simple list.
 */
export const ReadSubtreeComponent = defineToolComponent({
  toolName: 'read_subtree',

  render(toolBlock, theme, options): ToolRenderConfig | null {
    const { paths } = toolBlock.input as { paths: string[] }

    return {
      content: (
        <SimpleToolCallItem
          name="Read subtree"
          description={paths.join(', ')}
          branchChar={options.branchChar}
        />
      ),
    }
  },
})
