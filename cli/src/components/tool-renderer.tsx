import { TextAttributes } from '@opentui/core'
import React from 'react'
import stringWidth from 'string-width'

import type { ContentBlock } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'

type ToolBlock = Extract<ContentBlock, { type: 'tool' }>

export type ToolRenderConfig = {
  path?: string
  content?: React.ReactNode
  collapsedPreview?: string
}

export type ToolRenderOptions = {
  availableWidth: number
  indentationOffset: number
  previewPrefix?: string
  labelWidth: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const extractPath = (toolBlock: ToolBlock, resultValue: unknown): string | null => {
  if (isRecord(toolBlock.input) && typeof toolBlock.input.path === 'string') {
    const trimmed = toolBlock.input.path.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  if (isRecord(resultValue) && typeof resultValue.path === 'string') {
    const trimmed = resultValue.path.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  return null
}

const summarizeFiles = (
  entries: unknown,
  maxItems: number,
  options: ToolRenderOptions,
): string | null => {
  const previewPrefix = options.previewPrefix ?? ''
  const previewPrefixWidth = stringWidth(previewPrefix)
  const alignmentPadding = Math.max(
    0,
    options.labelWidth - previewPrefixWidth,
  )
  const totalPrefixWidth = previewPrefixWidth + alignmentPadding
  const maxWidth = Math.max(
    20,
    options.availableWidth - options.indentationOffset - totalPrefixWidth - 6,
  )

  if (!Array.isArray(entries) || entries.length === 0) {
    return null
  }

  const validNames = entries
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (validNames.length === 0) {
    return null
  }

  const summaryNames: string[] = []
  let widthUsed = 0

  for (let index = 0; index < validNames.length; index += 1) {
    if (summaryNames.length >= maxItems) {
      break
    }

    const name = validNames[index]
    const prefix = summaryNames.length === 0 ? '' : ', '
    const candidate = `${prefix}${name}`
    const candidateWidth = stringWidth(candidate)
    const wouldExceedWidth = widthUsed + candidateWidth > maxWidth

    if (summaryNames.length > 0 && wouldExceedWidth) {
      break
    }

    summaryNames.push(name)
    widthUsed += candidateWidth

    if (summaryNames.length === 1 && wouldExceedWidth) {
      break
    }
  }

  if (summaryNames.length === 0) {
    summaryNames.push(validNames[0])
  }

  const hasMore = summaryNames.length < validNames.length
  const summary = summaryNames.join(', ')
  return hasMore ? `${summary}, ...` : summary
}

const getListDirectoryRender = (
  toolBlock: ToolBlock,
  theme: ChatTheme,
  options: ToolRenderOptions,
): ToolRenderConfig => {
  const MAX_ITEMS = 3
  const resultValue = Array.isArray(toolBlock.outputRaw)
    ? (toolBlock.outputRaw[0] as any)?.value
    : undefined

  if (!isRecord(resultValue)) {
    return {}
  }

  const filesLine = summarizeFiles(resultValue.files, MAX_ITEMS, options)
  const fallbackLine = filesLine
    ? null
    : summarizeFiles(resultValue.directories, MAX_ITEMS, options)
  const path = extractPath(toolBlock, resultValue)

  const summaryLine = filesLine ?? fallbackLine

  if (!summaryLine && !path) {
    return {}
  }

  const summaryColor = theme.foreground
  const baseAttributes = theme.messageTextAttributes ?? 0
  const getAttributes = (extra: number = 0): number | undefined => {
    const combined = baseAttributes | extra
    return combined === 0 ? undefined : combined
  }

  const previewPrefix = options.previewPrefix ?? ''
  const previewPrefixWidth = stringWidth(previewPrefix)
  const alignmentPadding = Math.max(
    0,
    options.labelWidth - previewPrefixWidth,
  )
  const alignmentSpaces = ' '.repeat(alignmentPadding)
  const paddedPrefix = `${previewPrefix}${alignmentSpaces}`
  const blankPrefix =
    previewPrefix.replace(/\s+$/, '') || previewPrefix
  const content =
    summaryLine !== null ? (
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <text
          fg={summaryColor}
          attributes={getAttributes(TextAttributes.ITALIC)}
          style={{ wrapMode: 'word' }}
        >
          {`${paddedPrefix}${summaryLine}`}
        </text>
        {previewPrefix ? (
          <text
            fg={summaryColor}
            attributes={getAttributes(TextAttributes.ITALIC)}
            style={{ wrapMode: 'none' }}
          >
            {blankPrefix}
          </text>
        ) : null}
      </box>
    ) : null

  const collapsedPreview = summaryLine ?? undefined

  return {
    path: path ?? undefined,
    content,
    collapsedPreview,
  }
}

export const getToolRenderConfig = (
  toolBlock: ToolBlock,
  theme: ChatTheme,
  options: ToolRenderOptions,
): ToolRenderConfig => {
  switch (toolBlock.toolName) {
    case 'list_directory':
      return getListDirectoryRender(toolBlock, theme, options)
    default:
      return {}
  }
}
