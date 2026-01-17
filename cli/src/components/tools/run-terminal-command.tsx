import { defineToolComponent } from './types'
import { TerminalCommandDisplay } from '../terminal-command-display'

import type { ToolRenderConfig } from './types'

export interface ParsedTerminalOutput {
  output: string | null
  startingCwd?: string
}

/**
 * Parse terminal command output from JSON or raw string format.
 * Exported for testing.
 */
export const parseTerminalOutput = (rawOutput: string | undefined): ParsedTerminalOutput => {
  if (!rawOutput) {
    return { output: null }
  }

  try {
    const parsed = JSON.parse(rawOutput)
    // Handle array format [{ type: 'json', value: {...} }]
    const value = Array.isArray(parsed) ? parsed[0]?.value : parsed
    if (value) {
      const startingCwd = value.startingCwd
      // Handle error case
      if (value.errorMessage) {
        return { output: `Error: ${value.errorMessage}`, startingCwd }
      }
      // Combine stdout and stderr for display
      // Use trimEnd() to preserve leading spaces (used for UI elements like trees/tables)
      const stdout = value.stdout || ''
      const stderr = value.stderr || ''
      const output = (stdout + stderr).trimEnd() || null
      return { output, startingCwd }
    }
    return { output: null }
  } catch {
    // If not JSON, use raw output (preserve leading spaces)
    return { output: rawOutput.trimEnd() || null }
  }
}

/**
 * UI component for run_terminal_command tool.
 * Displays the command in bold next to the bullet point,
 * with the output indented below.
 */
export const RunTerminalCommandComponent = defineToolComponent({
  toolName: 'run_terminal_command',

  render(toolBlock): ToolRenderConfig {
    // Extract command from input
    const command =
      toolBlock.input && typeof (toolBlock.input as any).command === 'string'
        ? (toolBlock.input as any).command.trim()
        : ''

    // Extract output and startingCwd from tool result
    const { output, startingCwd } = parseTerminalOutput(toolBlock.output)

    // Custom content component using shared TerminalCommandDisplay
    const content = (
      <TerminalCommandDisplay
        command={command}
        output={output}
        expandable={true}
        maxVisibleLines={5}
        cwd={startingCwd}
      />
    )

    return {
      content,
      collapsedPreview: `$ ${command}`,
    }
  },
})
