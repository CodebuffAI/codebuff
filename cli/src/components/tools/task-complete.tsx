import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

const TaskCompleteItem = () => {
  const theme = useTheme()
  const bulletChar = '• '

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.foreground}>{bulletChar}</span>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          Task Complete
        </span>
      </text>
    </box>
  )
}

/**
 * UI component for task_completed tool.
 * Displays a simple bullet point with "Task Complete" in bold.
 */
export const TaskCompleteComponent = defineToolComponent({
  toolName: 'task_completed',

  render(toolBlock, theme, options): ToolRenderConfig | null {
    return {
      content: <TaskCompleteItem />,
    }
  },
})
