import { defineToolComponent } from './types'
import { TerminalCommandDisplay } from '../terminal-command-display'

import type { ToolRenderConfig } from './types'

/**
 * UI component for run_terminal_command tool.
 * Displays the command in bold next to the bullet point,
 * with the output indented below.
 */
export const RunTerminalCommandComponent = defineToolComponent({
  toolName: 'run_terminal_command',

  render(toolBlock, theme): ToolRenderConfig {
    // Extract command from input
    const command =
      toolBlock.input && typeof (toolBlock.input as any).command === 'string'
        ? (toolBlock.input as any).command.trim()
        : ''

    // Extract output and startingCwd from tool result
    let output: string | null = null
    let startingCwd: string | undefined

    if (toolBlock.output) {
      try {
        const parsed = JSON.parse(toolBlock.output)
        // Handle array format [{ type: 'json', value: {...} }]
        const value = Array.isArray(parsed) ? parsed[0]?.value : parsed
        if (value) {
          startingCwd = value.startingCwd
          // Handle error case
          if (value.errorMessage) {
            output = `Error: ${value.errorMessage}`
          } else {
            // Combine stdout and stderr for display
            const stdout = value.stdout || ''
            const stderr = value.stderr || ''
            output = (stdout + stderr).trim() || null
          }
        }
      } catch {
        // If not JSON, use raw output
        output = toolBlock.output.trim() || null
      }
    }

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
