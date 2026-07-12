import React from 'react'

import { DiscoveryOutput, discoveryStatus } from './discovery-output'
import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'
import { useTheme } from '../../hooks/use-theme'
import {
  getStructuredErrorMessages,
  getToolOutputRecords,
} from '../../utils/tool-result-normalizer'

import type { ToolRenderConfig } from './types'

/**
 * UI component for list_directory tool.
 * Displays a single line showing the directories being listed.
 * Does not support expand/collapse - always shows as a single line.
 */
export const ListDirectoryComponent = defineToolComponent({
  toolName: 'list_directory',

  render(toolBlock, _theme, options): ToolRenderConfig {
    const input = toolBlock.input as any

    // Extract directories from input
    let directories: string[] = []

    if (Array.isArray(input?.directories)) {
      directories = input.directories
        .map((dir: any) =>
          typeof dir === 'object' && dir.path ? dir.path : dir,
        )
        .filter(
          (path: any) => typeof path === 'string' && path.trim().length > 0,
        )
    } else if (
      typeof input?.path === 'string' &&
      input.path.trim().length > 0
    ) {
      directories = [input.path.trim()]
    }

    if (directories.length === 0) {
      return { content: null }
    }

    const record = getToolOutputRecords(toolBlock.outputRaw)[0]
    const files = Array.isArray(record?.files)
      ? record.files.filter((file): file is string => typeof file === 'string')
      : []
    const childDirectories = Array.isArray(record?.directories)
      ? record.directories.filter(
          (directory): directory is string => typeof directory === 'string',
        )
      : []
    const entries = [
      ...childDirectories.map((directory) => `${directory}/`),
      ...files,
    ]
    const error = getStructuredErrorMessages(
      toolBlock.outputRaw ?? toolBlock.output,
    )[0]
    const hasOutput =
      toolBlock.outputRaw !== undefined || Boolean(toolBlock.output?.trim())
    const status = discoveryStatus({
      lifecycle: toolBlock.lifecycle,
      hasOutput,
      error,
      count: entries.length,
    })
    const description = `${directories.join(', ')}${hasOutput && !error ? ` (${childDirectories.length} dirs, ${files.length} files)` : ''} · ${status}`

    // Use a wrapper component to access theme
    const ListDirectoryContent = () => {
      const theme = useTheme()
      return (
        <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
          <SimpleToolCallItem
            name="List"
            description={description}
            descriptionColor={theme.directory}
          />
          <DiscoveryOutput
            status={status}
            error={error}
            provenance={directories.join(', ')}
            items={entries}
            availableWidth={options.availableWidth}
          />
        </box>
      )
    }

    return {
      collapsedPreview: description,
      content: <ListDirectoryContent />,
    }
  },
})
