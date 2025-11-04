import React from 'react'

import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for run_terminal_command tool.
 * Displays the command being executed as a collapsed preview.
 */
export const RunTerminalCommandComponent = defineToolComponent({
  toolName: 'run_terminal_command',
  
  render(toolBlock): ToolRenderConfig | null {
    // Extract command from input
    const command =
      toolBlock.input && typeof (toolBlock.input as any).command === 'string'
        ? (toolBlock.input as any).command.trim()
        : null

    if (!command) {
      return null
    }

    // Show command with shell prompt for collapsed preview
    const collapsedPreview = `$ ${command}`

    return {
      collapsedPreview,
    }
  },
})
