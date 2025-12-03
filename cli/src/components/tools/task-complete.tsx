import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for task_completed tool.
 * Displays a simple bullet point with "Task Complete" in bold.
 */
export const TaskCompleteComponent = defineToolComponent({
  toolName: 'task_completed',

  render(): ToolRenderConfig {
    return {
      content: null,
    }
  },
})
