import React from 'react'

import { DiscoveryOutput, discoveryStatus } from './discovery-output'
import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import {
  getStructuredErrorMessages,
  getToolOutputRecords,
} from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig } from './types'

/**
 * UI component for glob tool.
 * Displays a single line showing the glob pattern and number of matching files.
 * Does not support expand/collapse - always shows as a single line.
 */
export const GlobComponent = defineToolComponent({
  toolName: 'glob',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const input = toolBlock.input as any
    const pattern = input?.pattern ?? ''
    const cwd = input?.cwd ?? ''

    const record = getToolOutputRecords(toolBlock.outputRaw)[0]
    const files = Array.isArray(record?.files)
      ? record.files.filter((file): file is string => typeof file === 'string')
      : []
    const count =
      typeof record?.count === 'number' ? record.count : files.length
    const error = getStructuredErrorMessages(
      toolBlock.outputRaw ?? toolBlock.output,
    )[0]
    const hasOutput =
      toolBlock.outputRaw !== undefined || Boolean(toolBlock.output?.trim())
    const status = discoveryStatus({
      lifecycle: toolBlock.lifecycle,
      hasOutput,
      error,
      count,
    })

    if (!pattern) {
      return { content: null }
    }

    // Build single-line summary
    let summary = pattern

    if (cwd) {
      summary += ` in ${cwd}`
    }

    if (hasOutput && !error) {
      summary += ` (${count} file${count === 1 ? '' : 's'})`
    }
    summary += ` · ${status}`

    return {
      collapsedPreview: summary,
      content: (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <SimpleToolCallItem name="Glob" description={summary} />
          <DiscoveryOutput
            status={status}
            message={
              typeof record?.message === 'string' ? record.message : undefined
            }
            error={error}
            provenance={cwd || 'project root'}
            items={files}
            availableWidth={options.availableWidth}
          />
        </box>
      ),
    }
  },
})
