import React from 'react'

import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

/**
 * UI component for code_search tool.
 * Displays a single line showing the search pattern, flags, and number of results.
 * Does not support expand/collapse - always shows as a single line.
 */
export const CodeSearchComponent = defineToolComponent({
  toolName: 'code_search',

  render(toolBlock): ToolRenderConfig {
    const input = toolBlock.input as any
    const pattern = input?.pattern ?? ''
    const cwd = input?.cwd ?? ''

    // Count results from output
    let totalResults = 0

    if (toolBlock.output && typeof toolBlock.output === 'string') {
      const lines = toolBlock.output.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()

        // Result lines start with a number followed by a colon
        if (/^\d+:/.test(trimmed)) {
          totalResults++
        }
      }
    }

    // Build single-line summary
    let summary = ''

    summary += `${pattern}`

    if (cwd) {
      summary += ` in ${cwd}`
    }

    // Disable showing flags since they are noisy.
    // if (flags) {
    //   summary += ` ${flags}`
    // }

    summary += ` (${totalResults} result${totalResults === 1 ? '' : 's'})`

    // Return as content using SimpleToolCallItem
    return {
      content: (
        <SimpleToolCallItem
          name="Search"
          description={summary}
        />
      ),
    }
  },
})
