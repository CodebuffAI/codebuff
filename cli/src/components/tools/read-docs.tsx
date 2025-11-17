import { TextAttributes } from '@opentui/core'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'

import type { ToolRenderConfig } from './types'

interface ReadDocsSimpleToolCallItemProps {
  name: string
  libraryTitle: string
  topic: string
}

const ReadDocsSimpleToolCallItem = ({
  name,
  libraryTitle,
  topic,
}: ReadDocsSimpleToolCallItemProps) => {
  const theme = useTheme()
  const bulletChar = '• '
  const labelWidth = 12 // Width of "• Read Docs " in characters

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
            <span fg={theme.foreground}>{libraryTitle}: {topic}</span>
          </text>
        </box>
      </box>
    </box>
  )
}

/**
 * UI component for read_docs tool.
 * Displays library name and topic in a compact format.
 * Does not support expand/collapse - always shows as a simple line.
 */
export const ReadDocsComponent = defineToolComponent({
  toolName: 'read_docs',

  render(toolBlock, theme, options): ToolRenderConfig {
    const input = toolBlock.input as any

    // Extract library and topic from input
    const libraryTitle = input?.libraryTitle ?? ''
    const topic = input?.topic ?? ''

    if (!libraryTitle && !topic) {
      return { content: null }
    }

    return {
      content: (
        <ReadDocsSimpleToolCallItem
          name="Read Docs"
          libraryTitle={libraryTitle}
          topic={topic}
        />
      ),
    }
  },
})
