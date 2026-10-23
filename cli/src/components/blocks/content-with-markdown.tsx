import { memo, useRef } from 'react'

import {
  renderMarkdown,
  hasMarkdown,
  type MarkdownPalette,
} from '../../utils/markdown-renderer'
import {
  createStreamingMarkdownCache,
  renderStreamingMarkdownCached,
} from '../../utils/streaming-markdown'

import type { StreamingMarkdownCache } from '../../utils/streaming-markdown'

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
    // Streaming text only ever grows, so the already-rendered blocks can be
    // kept and the tail re-rendered: parsing the whole message on every flush
    // is what made long answers stall the render thread.
    const cache = useRef<StreamingMarkdownCache | null>(null)
    if (cache.current === null) {
      cache.current = createStreamingMarkdownCache()
    }

    if (!hasMarkdown(content)) {
      return content
    }

    const options = { codeBlockWidth, palette }
    if (isStreaming) {
      return renderStreamingMarkdownCached(content, options, cache.current)
    }

    // Done streaming: render once from scratch so the final output does not
    // depend on how the deltas happened to be split.
    cache.current = createStreamingMarkdownCache()
    return renderMarkdown(content, options)
  },
)
