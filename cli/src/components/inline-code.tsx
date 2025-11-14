import {
  CodeRenderable,
  SyntaxStyle,
  parseColor,
  type RenderContext,
} from '@opentui/core'
import { extend } from '@opentui/react'
import type { ReactNode } from 'react'

interface InlineCodeProps {
  content: string
  filetype: string
  fg?: string
}

// Create a syntax style for inline code
const inlineCodeSyntaxStyle = SyntaxStyle.fromStyles({
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
 * Inline code component using OpenTUI's CodeRenderable for syntax highlighting
 */
class InlineCodeRenderable extends CodeRenderable {
  constructor(ctx: RenderContext, props: InlineCodeProps) {
    super(ctx, {
      content: props.content,
      filetype: props.filetype,
      syntaxStyle: inlineCodeSyntaxStyle,
      drawUnstyledText: true,
      conceal: false,
    })
  }
}

// Register with OpenTUI React
declare module '@opentui/react' {
  interface OpenTUIComponents {
    inlineCode: typeof InlineCodeRenderable
  }
}

extend({ inlineCode: InlineCodeRenderable })

/**
 * Helper component to render code with optional color overlay
 */
export function InlineCode({
  content,
  filetype,
  fg,
}: InlineCodeProps): ReactNode {
  if (!filetype) {
    return <span fg={fg}>{content}</span>
  }

  // Use CodeRenderable for syntax highlighting
  return (
    <inlineCode content={content} filetype={filetype} fg={fg} />
  )
}
