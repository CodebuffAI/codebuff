import { TextAttributes } from '@opentui/core'
import { useState } from 'react'

import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import { Button } from '../button'
import { useTerminalDimensions } from '../../hooks/use-terminal-dimensions'
import { getLastNVisualLines } from '../../utils/text-layout'

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
  const { contentMaxWidth } = useTerminalDimensions()
  const padding = 5
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

  // Use visual line calculation based on terminal width
  const width = Math.max(10, Math.min(contentMaxWidth - padding * 2, 120))
  const allLines = output.split('\n')

  // Calculate total visual lines across all output lines
  let totalVisualLines = 0
  const visualLinesByOriginalLine: string[][] = []

  for (const line of allLines) {
    const { lines: wrappedLines } = getLastNVisualLines(line, width, Infinity)
    visualLinesByOriginalLine.push(wrappedLines)
    totalVisualLines += wrappedLines.length
  }

  const hasMoreThanFiveLines = totalVisualLines > 5
  const hiddenLinesCount = totalVisualLines - 5

  // Build display output
  let displayOutput: string
  if (isExpanded || !hasMoreThanFiveLines) {
    displayOutput = output
  } else {
    // Take first 5 visual lines
    const displayLines: string[] = []
    let count = 0

    for (const wrappedLines of visualLinesByOriginalLine) {
      for (const line of wrappedLines) {
        if (count >= 5) break
        displayLines.push(line)
        count++
      }
      if (count >= 5) break
    }

    displayOutput = displayLines.join('\n')
  }

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
          <Button
            style={{ marginTop: 0 }}
            onClick={() => setIsExpanded(!isExpanded)}
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
          </Button>
        )}
      </box>
    </box>
  )
}
