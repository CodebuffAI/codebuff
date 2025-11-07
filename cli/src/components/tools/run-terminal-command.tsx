import { TextAttributes } from '@opentui/core'
import { useState } from 'react'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'

import type { ToolRenderConfig } from './types'

/**
 * UI component for run_terminal_command tool.
 * Displays the command in bold next to the bullet point,
 * with the output indented below.
 */
export const RunTerminalCommandComponent = defineToolComponent({
  toolName: 'run_terminal_command',

  render(toolBlock, theme): ToolRenderConfig | null {
    // Extract command from input
    const command =
      toolBlock.input && typeof (toolBlock.input as any).command === 'string'
        ? (toolBlock.input as any).command.trim()
        : null

    if (!command) {
      return null
    }

    // Extract output if available
    const output = toolBlock.output ? toolBlock.output.trim() : null

    // Custom content component
    const content = <TerminalCommandContent command={command} output={output} />

    return {
      content,
      collapsedPreview: `$ ${command}`,
    }
  },
})

interface TerminalCommandContentProps {
  command: string
  output: string | null
}

const TerminalCommandContent = ({
  command,
  output,
}: TerminalCommandContentProps) => {
  const theme = useTheme()
  const [isExpanded, setIsExpanded] = useState(false)

  if (!output) {
    return (
      <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
        <box
          style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.foreground}>{'$ '}</span>
            <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
              {`${command}`}
            </span>
          </text>
        </box>
      </box>
    )
  }

  const lines = output.split('\n')
  const hasMoreThanFiveLines = lines.length > 5
  const displayLines =
    isExpanded || !hasMoreThanFiveLines ? lines : lines.slice(0, 5)
  const displayOutput = displayLines.join('\n')
  const hiddenLinesCount = lines.length - 5

  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      <box
        style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}
      >
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.foreground}>{'$ '}</span>
          <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
            {`${command}`}
          </span>
        </text>
      </box>
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          paddingLeft: 2,
          width: '100%',
        }}
      >
        <text fg={theme.muted} style={{ wrapMode: 'word' }}>
          {displayOutput}
        </text>
        {hasMoreThanFiveLines && (
          <box
            style={{ marginTop: 0 }}
            onMouseDown={() => setIsExpanded(!isExpanded)}
          >
            <text
              fg={theme.secondary}
              style={{ wrapMode: 'word' }}
              attributes={TextAttributes.UNDERLINE}
            >
              {isExpanded
                ? 'Show less'
                : `Show ${hiddenLinesCount} more ${hiddenLinesCount === 1 ? 'line' : 'lines'}`}
            </text>
          </box>
        )}
      </box>
    </box>
  )
}
