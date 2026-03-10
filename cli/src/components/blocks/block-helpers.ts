
export function trimNewlines(str: string): string {
  return str.replace(/^\n+|\n+$/g, '')
}

export function sanitizePreview(text: string): string {
  return text.replace(/[#*_`~\[\]()]/g, '').trim()
}

// Re-export from block-processor for backwards compatibility
export { isReasoningTextBlock } from '../../utils/block-processor'
