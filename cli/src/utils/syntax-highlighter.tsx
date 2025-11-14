import {
  SyntaxStyle,
  getTreeSitterClient,
  parseColor,
  type SimpleHighlight,
} from '@opentui/core'
import type { ReactNode } from 'react'
import { logger } from './logger'
import { getErrorObject } from './error'

interface HighlightOptions {
  fg?: string
  monochrome?: boolean
}

// Create a default syntax style for code highlighting
const defaultSyntaxStyle = SyntaxStyle.fromStyles({
  keyword: { fg: parseColor('#FF7B72'), bold: true },
  string: { fg: parseColor('#A5D6FF') },
  comment: { fg: parseColor('#8B949E'), italic: true },
  number: { fg: parseColor('#79C0FF') },
  function: { fg: parseColor('#D2A8FF') },
  'function.method': { fg: parseColor('#D2A8FF') },
  type: { fg: parseColor('#FFA657') },
  'type.builtin': { fg: parseColor('#79C0FF') },
  operator: { fg: parseColor('#FF7B72') },
  variable: { fg: parseColor('#FFA657') },
  'variable.parameter': { fg: parseColor('#FFA657') },
  property: { fg: parseColor('#79C0FF') },
  constant: { fg: parseColor('#79C0FF') },
  'constant.builtin': { fg: parseColor('#79C0FF') },
  punctuation: { fg: parseColor('#C9D1D9') },
  'punctuation.bracket': { fg: parseColor('#C9D1D9') },
  'punctuation.delimiter': { fg: parseColor('#C9D1D9') },
  default: { fg: parseColor('#F0F6FC') },
})

/**
 * Convert SimpleHighlight array to React spans
 * SimpleHighlight format: [startByte, endByte, highlightGroup, metadata?]
 * Byte positions are UTF-8 byte offsets in the source code string
 */
function simpleHighlightsToSpans(
  code: string,
  highlights: SimpleHighlight[],
  syntaxStyle: SyntaxStyle,
): ReactNode[] {
  if (highlights.length === 0) {
    return [code]
  }

  // Convert byte positions to character positions
  const encoder = new TextEncoder()
  const bytes = encoder.encode(code)
  
  // Build a map from byte position to character position
  const byteToChar = new Map<number, number>()
  let charPos = 0
  let bytePos = 0
  
  for (const char of code) {
    byteToChar.set(bytePos, charPos)
    const charBytes = encoder.encode(char)
    bytePos += charBytes.length
    charPos++
  }
  byteToChar.set(bytePos, charPos) // End position

  // Sort highlights by start position
  const sortedHighlights = [...highlights].sort((a, b) => a[0] - b[0])

  const parts: ReactNode[] = []
  let currentPos = 0

  for (const [startByte, endByte, group] of sortedHighlights) {
    const startChar = byteToChar.get(startByte) ?? currentPos
    const endChar = byteToChar.get(endByte) ?? code.length

    // Add any unhighlighted text before this highlight
    if (startChar > currentPos) {
      parts.push(code.slice(currentPos, startChar))
    }

    // Add the highlighted span
    const text = code.slice(startChar, endChar)
    const style = syntaxStyle.getStyle(group)

    if (style && style.fg) {
      const fgColor = `#${style.fg.r.toString(16).padStart(2, '0')}${style.fg.g.toString(16).padStart(2, '0')}${style.fg.b.toString(16).padStart(2, '0')}`
      const attrs = (style.bold ? 1 : 0) | (style.italic ? 2 : 0) | (style.underline ? 4 : 0)
      
      parts.push(
        <span key={`hl-${startChar}-${endChar}`} fg={fgColor} attributes={attrs || undefined}>
          {text}
        </span>,
      )
    } else {
      parts.push(text)
    }

    currentPos = endChar
  }

  // Add any remaining unhighlighted text
  if (currentPos < code.length) {
    parts.push(code.slice(currentPos))
  }

  return parts
}

/**
 * Highlight code using OpenTUI's Tree-sitter integration
 */
export async function highlightCode(
  code: string,
  lang: string,
  options: HighlightOptions = {},
): Promise<ReactNode> {
  const { fg = '#d1d5db', monochrome = false } = options

  if (monochrome || !lang) {
    return <span fg={fg}>{code}</span>
  }

  try {
    const client = getTreeSitterClient()
    logger.debug('[SyntaxHighlighter] Initializing Tree-sitter client')
    await client.initialize()
    logger.debug('[SyntaxHighlighter] Tree-sitter client initialized')

    // Use highlightOnce which returns { highlights?, warning?, error? }
    const result = await client.highlightOnce(code, lang)

    logger.debug(
      { code, lang, result },
      '[SyntaxHighlighter] Highlighting code result',
    )

    if (!result.highlights || result.highlights.length === 0) {
      // No highlights available, return plain text
      return <span fg={fg}>{code}</span>
    }

    // Convert highlights to React spans
    const spans = simpleHighlightsToSpans(
      code,
      result.highlights,
      defaultSyntaxStyle,
    )

    return <>{spans}</>
  } catch (error) {
    logger.error(
      { code, lang, error: getErrorObject(error) },
      '[SyntaxHighlighter] Error highlighting code',
    )
    // Fallback to plain code if highlighting fails
    return <span fg={fg}>{code}</span>
  }
}

/**
 * Synchronous version that attempts to highlight code immediately
 * Note: This may not work if the Tree-sitter client hasn't been initialized
 * Falls back to plain text if highlighting fails
 */
export function highlightCodeSync(
  code: string,
  lang: string,
  options: HighlightOptions = {},
): ReactNode {
  const { fg = '#d1d5db', monochrome = false } = options

  if (monochrome || !lang) {
    return <span fg={fg}>{code}</span>
  }

  // For now, return plain text since synchronous highlighting requires
  // the client to be pre-initialized and Tree-sitter operations are async
  // In practice, use the async highlightCode function instead
  return <span fg={fg}>{code}</span>
}
