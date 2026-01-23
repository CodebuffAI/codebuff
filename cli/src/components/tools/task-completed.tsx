import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for task_completed tool.
 */
export const TaskCompleteComponent = defineToolComponent({
  toolName: 'task_completed',

  render(): ToolRenderConfig {
    return {
      content: null,
    }
  },
})
