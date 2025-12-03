import { TextAttributes } from '@opentui/core'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'

import type { ToolRenderConfig } from './types'

interface ReadFilesSimpleToolCallItemProps {
  name: string
  filePaths: string[]
}

const ReadFilesSimpleToolCallItem = ({
  name,
  filePaths,
}: ReadFilesSimpleToolCallItemProps) => {
  const theme = useTheme()
  const bulletChar = '• '
  const labelWidth = 7 // Width of "• Read " in characters

  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      <box style={{ flexDirection: 'row', width: '100%' }}>
        <box style={{ width: labelWidth, flexShrink: 0 }}>
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.foreground}>{bulletChar}</span>
            <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
              {name}
            </span>
          </text>
        </box>
        <box style={{ flexGrow: 1 }}>
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.foreground}>{filePaths.join(', ')}</span>
          </text>
        </box>
      </box>
    </box>
  )
}

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
    let filePaths: string[] = []

    if (Array.isArray(input?.paths)) {
      filePaths = input.paths.filter(
        (path: any) => typeof path === 'string' && path.trim().length > 0,
      )
    }

    if (filePaths.length === 0) {
      return { content: null }
    }

    return {
      content: (
        <ReadFilesSimpleToolCallItem name="Read" filePaths={filePaths} />
      ),
    }
  },
})
