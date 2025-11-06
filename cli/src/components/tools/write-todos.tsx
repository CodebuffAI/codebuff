import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'
import { defineToolComponent } from './types'
import type { ToolRenderConfig } from './types'

interface WriteTodosItemProps {
  todos: Array<{ task: string; completed: boolean }>
  branchChar: string
}

const WriteTodosItem = ({ todos, branchChar }: WriteTodosItemProps) => {
  const theme = useTheme()
  const bulletChar = '• '

  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      {/* Header line */}
      <box
        style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}
      >
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.foreground}>{branchChar || bulletChar}</span>
          <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
            TODOs
          </span>
        </text>
      </box>

      {/* Todo items */}
      {todos.map((todo, index) => (
        <box
          key={`todo-${index}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            paddingLeft: 2,
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            {todo.completed ? (
              <>
                <span fg={theme.success}>✓ </span>
                <span
                  fg={theme.muted}
                  attributes={TextAttributes.STRIKETHROUGH}
                >
                  {todo.task}
                </span>
              </>
            ) : (
              <>
                <span fg={theme.foreground}>☐ </span>
                <span fg={theme.foreground}>{todo.task}</span>
              </>
            )}
          </text>
        </box>
      ))}
    </box>
  )
}

/**
 * UI component for write_todos tool.
 * Displays todos with checkboxes for incomplete items and checkmarks for completed items.
 */
export const WriteTodosComponent = defineToolComponent({
  toolName: 'write_todos',

  render(toolBlock, theme, options): ToolRenderConfig | null {
    const { input } = toolBlock

    // Extract todos from input
    let todos: Array<{ task: string; completed: boolean }> = []

    if (Array.isArray(input?.todos)) {
      todos = input.todos.filter(
        (todo: any) =>
          typeof todo === 'object' &&
          typeof todo.task === 'string' &&
          typeof todo.completed === 'boolean',
      )
    }

    if (todos.length === 0) {
      return null
    }

    return {
      content: <WriteTodosItem todos={todos} branchChar={options.branchChar} />,
    }
  },
})
