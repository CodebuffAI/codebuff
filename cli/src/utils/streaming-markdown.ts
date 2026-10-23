import { Fragment, createElement, memo } from 'react'

import {
  hasIncompleteCodeFence,
  renderMarkdownNodes,
  trimTrailingWhitespace,
} from './markdown-renderer'

import type { MarkdownRenderOptions } from './markdown-renderer'
import type { ReactNode } from 'react'

/**
 * Incremental renderer for the block that is still streaming.
 *
 * `renderMarkdown` costs roughly 3ms per kilobyte, and the live message is
 * re-rendered on every flush while it grows - so a long answer re-parsed its
 * whole transcript about ten times a second: a 200KB answer cost ~480ms of
 * parsing per flush, on the render thread.
 *
 * Streaming text is append-only, so every complete block before the last
 * boundary can be parsed once and reused. Only the tail - the block currently
 * being written - is re-rendered per flush.
 */

/**
 * Rendered once per committed segment. `memo` keeps React from re-walking the
 * already-rendered prefix on every flush: the element objects are reused, so
 * the reconcile cost stays proportional to the tail rather than the message.
 */
const RenderedSegment = memo(function RenderedSegment({
  nodes,
}: {
  nodes: ReactNode[]
}) {
  return createElement(Fragment, null, ...nodes)
})

export type StreamingMarkdownCache = {
  /** Already parsed and reusable. `content` must start with this. */
  prefix: string
  /** Committed segments, each a memoized element. */
  segmentElements: ReactNode[]
  /** How many segments have been committed; keys segment node keys apart. */
  segments: number
  /** Whether a fenced code block is still open at the end of `prefix`. */
  fenceOpen: boolean
  /** Options the nodes were rendered with; a change invalidates them. */
  codeBlockWidth: number
  palette: unknown
}

export const createStreamingMarkdownCache = (): StreamingMarkdownCache => ({
  prefix: '',
  segmentElements: [],
  segments: 0,
  fenceOpen: false,
  codeBlockWidth: -1,
  palette: undefined,
})

/** A blank line only separates blocks cleanly outside lists and quotes. */
const LIST_OR_QUOTE_LINE = /^[ \t]*(?:[-*+]|\d+[.)]|>)/

const previousLine = (content: string, index: number): string => {
  let start = index - 1
  while (start >= 0 && content[start] !== '\n') start--
  return content.slice(start + 1, index)
}

const nextLine = (content: string, index: number): string => {
  let start = index
  while (
    start < content.length &&
    (content[start] === '\n' || content[start] === ' ' || content[start] === '\t')
  ) {
    start++
  }
  let end = start
  while (end < content.length && content[end] !== '\n') end++
  return content.slice(start, end)
}

const isSafeBoundary = (content: string, blankIndex: number): boolean => {
  const next = nextLine(content, blankIndex)
  // Nothing rendered after the boundary yet: no stable content to commit.
  if (!next) return false

  // A list or blockquote can continue across a blank line (loose lists), and
  // parsing the halves separately would restart ordered numbering or split the
  // quote. Leave those boundaries to the tail. Excluding them also means the
  // last committed block is never a paragraph followed by a list, which is the
  // only case where the renderer's trailing separator depends on the sibling
  // on the other side of the boundary.
  const prev = previousLine(content, blankIndex)
  if (LIST_OR_QUOTE_LINE.test(prev) || LIST_OR_QUOTE_LINE.test(next)) {
    return false
  }

  return true
}

/**
 * Renders streaming markdown by reusing the parse of the stable prefix.
 *
 * Produces the same output as `renderStreamingMarkdown` for content that
 * extends what was rendered before; falls back to a full parse when the
 * content is replaced (chat reload, edit) or has no safe boundary yet.
 */
export function renderStreamingMarkdownCached(
  content: string,
  options: MarkdownRenderOptions,
  cache: StreamingMarkdownCache,
): ReactNode {
  const codeBlockWidth = options.codeBlockWidth ?? 80

  if (
    codeBlockWidth !== cache.codeBlockWidth ||
    options.palette !== cache.palette ||
    !content.startsWith(cache.prefix)
  ) {
    cache.prefix = ''
    cache.segmentElements = []
    cache.segments = 0
    cache.fenceOpen = false
    cache.codeBlockWidth = codeBlockWidth
    cache.palette = options.palette
  }

  let fenceOpen = cache.fenceOpen
  let split = -1
  let fenceAtSplit = false

  for (let i = cache.prefix.length; i < content.length; i++) {
    if (content.charCodeAt(i) === 96 /* ` */ && content.startsWith('```', i)) {
      fenceOpen = !fenceOpen
      i += 2
      continue
    }
    if (
      !fenceOpen &&
      content.charCodeAt(i) === 10 /* \n */ &&
      content[i + 1] === '\n' &&
      isSafeBoundary(content, i)
    ) {
      split = i
      fenceAtSplit = fenceOpen
      i += 1
    }
  }

  if (split > cache.prefix.length) {
    const segment = content.slice(cache.prefix.length, split)
    const key = `md-seg-${cache.segments++}`
    // The renderer ends a block with its separator (`\n\n`); hold that at the
    // top level instead of inside the memoized element, so the final trim can
    // still drop it when nothing follows. Every boundary this renderer picks
    // sits between two top-level blocks and never before a list or quote,
    // which is the only case where the separator would be a single `\n`.
    cache.segmentElements.push(
      createElement(RenderedSegment, {
        key,
        nodes: trimTrailingWhitespace(
          renderMarkdownNodes(segment, options, `${key}-`),
        ),
      }),
      '\n\n',
    )
    cache.prefix = content.slice(0, split)
    cache.fenceOpen = fenceAtSplit
  }

  const tail = content.slice(cache.prefix.length)

  if (tail && hasIncompleteCodeFence(tail)) {
    // Same split as renderStreamingMarkdown: rendered blocks, then the
    // unterminated fence as literal text so it is not half-highlighted. That
    // function trims the trailing separator before appending the literal text
    // (so the pending fence continues the previous line); trimming here too
    // keeps the stitched output identical.
    const lastFence = tail.lastIndexOf('```')
    const trimmedBefore = trimTrailingWhitespace([
      ...cache.segmentElements,
      ...renderMarkdownNodes(tail.slice(0, lastFence), options, 'md-tail-'),
    ])
    return createElement(
      Fragment,
      null,
      ...trimmedBefore,
      tail.slice(lastFence),
    )
  }

  const tailNodes = tail
    ? renderMarkdownNodes(tail, options, 'md-tail-')
    : []
  const trimmed = trimTrailingWhitespace([...cache.segmentElements, ...tailNodes])
  if (trimmed.length === 0) {
    return ''
  }
  if (trimmed.length === 1) {
    return trimmed[0]
  }
  return createElement(Fragment, null, ...trimmed)
}
