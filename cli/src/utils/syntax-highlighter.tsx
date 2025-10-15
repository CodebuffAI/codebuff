import type { ReactNode } from 'react'

interface HighlightOptions {
  fg?: string
  monochrome?: boolean
}

// Basic syntax highlighting for common languages
export function highlightCode(
  code: string,
  lang: string,
  bg: string,
  options: HighlightOptions = {},
): ReactNode {
  const { fg = 'brightWhite' } = options

  // For now, just return the code with basic styling
  // Can be enhanced later with actual syntax highlighting
  return (
    <span fg={fg} bg={bg}>
      {code}
    </span>
  )
}
