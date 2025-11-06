import { TextAttributes } from '@opentui/core'
import React from 'react'
import stringWidth from 'string-width'

import { useTheme } from '../../hooks/use-theme'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

interface ReadFilesSimpleToolCallItemProps {
  name: string
  filePaths: string[]
  branchChar: string
  maxNewlineFiles?: number
}

const ReadFilesSimpleToolCallItem = ({
  name,
  filePaths,
  branchChar,
  maxNewlineFiles = 2,
}: ReadFilesSimpleToolCallItemProps) => {
  const theme = useTheme()
  const bulletChar = '• '
  const hasBranch = !!branchChar && branchChar.length > 0
  const toggleIndicator = '▸ '
  const toggleWidth = stringWidth(toggleIndicator)
  const branchHead = hasBranch ? branchChar.replace(/\s+$/, '') : ''
  const dashFiller = '─'.repeat(toggleWidth)
  const labelPrefix = hasBranch
    ? `${branchHead}${dashFiller} `
    : branchChar || bulletChar
  const baseIndentWidth = stringWidth(labelPrefix) + stringWidth(name + ' ')

  // Split files into two groups
  const firstFilePath = filePaths[0]
  const newlineFiles = filePaths.slice(1, maxNewlineFiles)
  const inlineFiles = filePaths.slice(maxNewlineFiles)

  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      {/* First line with name */}
      <box
        style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}
      >
        <text style={{ wrapMode: 'word' }}>
          <span fg={theme.foreground}>{labelPrefix}</span>
          <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
            {name}
          </span>
        </text>
        {firstFilePath && (
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.foreground}>{' ' + firstFilePath}</span>
          </text>
        )}
      </box>

      {/* Files on newlines */}
      {newlineFiles.map((file, index) => (
        <box
          key={`newline-${index}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            paddingLeft: baseIndentWidth,
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.foreground}>{file}</span>
          </text>
        </box>
      ))}

      {/* Remaining files inline */}
      {inlineFiles.length > 0 && (
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            paddingLeft: baseIndentWidth,
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.foreground}>{inlineFiles.join(', ')}</span>
          </text>
        </box>
      )}
    </box>
  )
}

/**
 * UI component for read_files tool.
 * Displays file paths with first few on newlines, rest inline.
 * Does not support expand/collapse - always shows as a simple list.
 */
export const ReadFilesComponent = defineToolComponent({
  toolName: 'read_files',

  render(toolBlock, theme, options): ToolRenderConfig | null {
    const input = toolBlock.input as any

    // Extract file paths from input
    let filePaths: string[] = []

    if (Array.isArray(input?.paths)) {
      filePaths = input.paths.filter(
        (path: any) => typeof path === 'string' && path.trim().length > 0,
      )
    }

    if (filePaths.length === 0) {
      return null
    }

    return {
      content: (
        <ReadFilesSimpleToolCallItem
          name="Read"
          filePaths={filePaths}
          branchChar={options.branchChar}
        />
      ),
    }
  },
})
