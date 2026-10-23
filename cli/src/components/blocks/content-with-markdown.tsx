import { memo } from 'react'

import {
  renderMarkdown,
  renderStreamingMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../../utils/markdown-renderer'

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
    if (!hasMarkdown(content)) {
      return content
    }
    const options = { codeBlockWidth, palette }
    if (isStreaming) {
      return renderStreamingMarkdown(content, options)
    }
    return renderMarkdown(content, options)
  },
)
