
export function trimTrailingNewlines(str: string): string {
  return str.replace(/\n+$/, '')
}

export function sanitizePreview(text: string): string {
  return text.replace(/[#*_`~\[\]()]/g, '').trim()
}

// Re-export from block-processor for backwards compatibility
export { isReasoningTextBlock } from '../../utils/block-processor'
