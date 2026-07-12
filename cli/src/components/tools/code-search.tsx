import React from 'react'

import { DiscoveryOutput, discoveryStatus } from './discovery-output'
import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { countCodeSearchResults } from '../../utils/code-search-summary'
import {
  getStructuredErrorMessages,
  getToolOutputRecords,
} from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig } from './types'

/**
 * UI component for code_search tool.
 * Displays a single line showing the search pattern, flags, and number of results.
 * Does not support expand/collapse - always shows as a single line.
 */
export const CodeSearchComponent = defineToolComponent({
  toolName: 'code_search',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const input = toolBlock.input as any
    const pattern = input?.pattern ?? ''
    const cwd = input?.cwd ?? ''

    const record = getToolOutputRecords(toolBlock.outputRaw)[0]
    const rawOutput =
      typeof record?.stdout === 'string'
        ? record.stdout
        : typeof record?.stdoutExcerpt === 'string'
          ? record.stdoutExcerpt
          : (toolBlock.output ?? '')
    const totalResults = countCodeSearchResults(rawOutput)
    const error = getStructuredErrorMessages(
      toolBlock.outputRaw ?? toolBlock.output,
    )[0]
    const hasOutput =
      toolBlock.outputRaw !== undefined || Boolean(toolBlock.output?.trim())
    const status = discoveryStatus({
      lifecycle: toolBlock.lifecycle,
      hasOutput,
      error,
      count: totalResults,
    })

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

    if (hasOutput && !error) {
      summary += ` (${totalResults} result${totalResults === 1 ? '' : 's'})`
    }
    summary += ` · ${status}`

    const outputLines = rawOutput
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
    const message =
      typeof record?.message === 'string' ? record.message : undefined

    return {
      collapsedPreview: summary,
      content: (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <SimpleToolCallItem name="Search" description={summary} />
          <DiscoveryOutput
            status={status}
            message={message}
            error={error}
            provenance={cwd || 'project root'}
            items={outputLines}
            maxVisibleItems={250}
            availableWidth={options.availableWidth}
          />
        </box>
      ),
    }
  },
})
