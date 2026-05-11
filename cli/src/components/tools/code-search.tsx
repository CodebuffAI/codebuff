import React from 'react'

import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { countCodeSearchResults } from '../../utils/code-search-summary'

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

    const totalResults = countCodeSearchResults(toolBlock.output)

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
      content: <SimpleToolCallItem name="Search" description={summary} />,
    }
  },
})
