import type { ReactNode } from 'react'

interface HighlightOptions {
  fg?: string
  monochrome?: boolean
}

// Basic syntax highlighting for common languages
export function highlightCode(
  code: string,
  lang: string,
  options: HighlightOptions = {},
): ReactNode {
  const { fg = '#d1d5db' } = options

  // For now, just return the code with basic styling
  // Can be enhanced later with actual syntax highlighting
  return <span fg={fg}>{code}</span>
}
