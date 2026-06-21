import { memo } from 'react'

import {
  renderMarkdown,
  renderStreamingMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../../utils/markdown-renderer'
import { wrapTextPreservingNewlines } from '../../utils/text-layout'

interface ContentWithMarkdownProps {
  content: string
  isStreaming: boolean
  codeBlockWidth: number
  palette: MarkdownPalette
}

export const ContentWithMarkdown = memo(
  ({
    content,
    isStreaming,
    codeBlockWidth,
    palette,
  }: ContentWithMarkdownProps) => {
    const safeCodeBlockWidth = Math.max(10, codeBlockWidth)

    if (!hasMarkdown(content)) {
      return wrapTextPreservingNewlines(content, safeCodeBlockWidth)
    }
    const options = { codeBlockWidth: safeCodeBlockWidth, palette }
    if (isStreaming) {
      return renderStreamingMarkdown(content, options)
    }
    return renderMarkdown(content, options)
  },
)
