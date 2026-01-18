import type { ContentBlock, TextContentBlock } from '../types/chat'

/**
 * Margin calculation result for a content block.
 */
export interface BlockMargins {
  marginTop: number
  marginBottom: number
}

/** Extracts margins for a text block, suppressing top margin after tool/agent blocks. */
export function extractTextBlockMargins(
  block: TextContentBlock,
  prevBlock: ContentBlock | null,
): BlockMargins {
  const prevBlockSuppressesMargin =
    prevBlock !== null &&
    (prevBlock.type === 'tool' || prevBlock.type === 'agent')

  const marginTop = prevBlockSuppressesMargin ? 0 : (block.marginTop ?? 0)
  const marginBottom = block.marginBottom ?? 0

  return { marginTop, marginBottom }
}

/** Extracts margins for an HTML block using explicit values without context adjustments. */
export function extractHtmlBlockMargins(block: {
  marginTop?: number
  marginBottom?: number
}): BlockMargins {
  return {
    marginTop: block.marginTop ?? 0,
    marginBottom: block.marginBottom ?? 0,
  }
}
