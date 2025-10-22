import React, { type ReactNode } from 'react'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { logger } from './logger'

import type {
  Root,
  Content,
  Text,
  Emphasis,
  Strong,
  InlineCode,
  Code,
  Heading,
  List,
  ListItem,
  Blockquote,
} from 'mdast'

export interface MarkdownPalette {
  inlineCodeFg: string
  codeBackground: string
  codeHeaderFg: string
  headingFg: Record<number, string>
  listBulletFg: string
  blockquoteBorderFg: string
  blockquoteTextFg: string
  dividerFg: string
  codeTextFg: string
  codeMonochrome: boolean
}

export interface MarkdownRenderOptions {
  palette?: Partial<MarkdownPalette>
}

const defaultPalette: MarkdownPalette = {
  inlineCodeFg: 'brightYellow',
  codeBackground: '#0d1117',
  codeHeaderFg: '#666',
  headingFg: {
    1: 'magenta',
    2: 'green',
    3: 'green',
    4: 'green',
    5: 'green',
    6: 'green',
  },
  listBulletFg: 'white',
  blockquoteBorderFg: 'gray',
  blockquoteTextFg: 'gray',
  dividerFg: '#666',
  codeTextFg: 'brightWhite',
  codeMonochrome: false,
}

const resolvePalette = (
  overrides?: Partial<MarkdownPalette>,
): MarkdownPalette => {
  const palette: MarkdownPalette = {
    ...defaultPalette,
    headingFg: { ...defaultPalette.headingFg },
  }

  if (!overrides) {
    return palette
  }

  const { headingFg, ...rest } = overrides
  Object.assign(palette, rest)

  if (headingFg) {
    palette.headingFg = {
      ...palette.headingFg,
      ...headingFg,
    }
  }

  return palette
}

const processor = unified().use(remarkParse)

// Render inline content - this is what gets placed INSIDE the <text> wrapper
function renderInlineContent(
  node: Content,
  key: string | number | undefined,
  palette: MarkdownPalette,
): ReactNode {
  switch (node.type) {
    case 'text':
      return (node as Text).value

    case 'emphasis':
      return (
        <em key={key}>
          {(node as Emphasis).children.map((child, index) =>
            renderInlineContent(child, index, palette),
          )}
        </em>
      )

    case 'strong':
      return (
        <strong key={key}>
          {(node as Strong).children.map((child, index) =>
            renderInlineContent(child, index, palette),
          )}
        </strong>
      )

    case 'inlineCode':
      return (
        <span key={key} fg={palette.inlineCodeFg}>
          {(node as InlineCode).value}
        </span>
      )

    case 'break':
      return '\n'

    default:
      return null
  }
}

// Convert markdown AST to inline JSX elements
function markdownToInline(
  node: Content | Root,
  palette: MarkdownPalette,
): ReactNode[] {
  const result: ReactNode[] = []

  switch (node.type) {
    case 'root':
      node.children.forEach((child, index) => {
        result.push(...markdownToInline(child, palette))
        // Add spacing between blocks
        if (index < node.children.length - 1) {
          result.push('\n')
        }
      })
      break

    case 'paragraph':
      node.children.forEach((child) => {
        result.push(renderInlineContent(child, undefined, palette))
      })
      result.push('\n')
      break

    case 'heading':
      const headingNode = node as Heading
      const depth = headingNode.depth
      const headingPrefix = '#'.repeat(depth) + ' '
      const headingColor =
        palette.headingFg[depth] ?? palette.headingFg[2] ?? 'white'

      result.push(
        <strong fg={headingColor}>
          {headingPrefix}
          {headingNode.children.map((child) =>
            renderInlineContent(child, undefined, palette),
          )}
        </strong>,
      )
      result.push('\n')
      break

    case 'list':
      const listNode = node as List
      listNode.children.forEach((item, index) => {
        const bullet = listNode.ordered ? `${index + 1}. ` : '• '
        result.push(<span fg={palette.listBulletFg}>{bullet}</span>)

        // Extract inline content from list item paragraphs
        const listItem = item as ListItem
        listItem.children.forEach((child) => {
          if (child.type === 'paragraph') {
            child.children.forEach((inlineChild) => {
              result.push(renderInlineContent(inlineChild, undefined, palette))
            })
          }
        })
        result.push('\n')
      })
      break

    case 'code':
      const codeNode = node as Code
      const codeBg = palette.codeBackground
      const headerLabel = codeNode.lang ? `[${codeNode.lang}]` : '[code]'

      result.push('\n')
      result.push(
        <span fg={palette.codeHeaderFg} bg={codeBg}>
          {headerLabel}
        </span>,
      )
      result.push('\n')
      result.push(
        <span fg={palette.codeTextFg} bg={codeBg}>
          {codeNode.value}
        </span>,
      )
      result.push('\n')
      break

    case 'blockquote':
      const blockquoteNode = node as Blockquote
      result.push(<span fg={palette.blockquoteBorderFg}>│ </span>)
      result.push(
        <em fg={palette.blockquoteTextFg}>
          {blockquoteNode.children.map((child) => {
            if (child.type === 'paragraph') {
              return child.children.map((inlineChild) =>
                renderInlineContent(inlineChild, undefined, palette),
              )
            }
            return null
          })}
        </em>,
      )
      result.push('\n')
      break

    case 'thematicBreak':
      result.push(<span fg={palette.dividerFg}>{'─'.repeat(40)}</span>)
      result.push('\n')
      break
  }

  return result
}

// Main function - returns inline JSX elements (no <text> wrapper)
export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): ReactNode {
  try {
    const ast = processor.parse(markdown)
    const palette = resolvePalette(options.palette)
    const inlineElements = markdownToInline(ast, palette)

    // Return a fragment containing all inline elements
    return <>{inlineElements}</>
  } catch (error) {
    logger.error(error, 'Failed to parse markdown')
    return markdown
  }
}

export function hasMarkdown(content: string): boolean {
  return /[*_`#>\-\+]|\[.*\]\(.*\)|```/.test(content)
}

export function hasIncompleteCodeFence(content: string): boolean {
  let fenceCount = 0
  const fenceRegex = /```/g
  while (fenceRegex.exec(content)) {
    fenceCount += 1
  }
  return fenceCount % 2 === 1
}

export function renderStreamingMarkdown(
  content: string,
  options: MarkdownRenderOptions = {},
): ReactNode {
  if (!hasMarkdown(content)) {
    return content
  }

  if (!hasIncompleteCodeFence(content)) {
    return renderMarkdown(content, options)
  }

  const lastFenceIndex = content.lastIndexOf('```')
  if (lastFenceIndex === -1) {
    return renderMarkdown(content, options)
  }

  const completeSection = content.slice(0, lastFenceIndex)
  const pendingSection = content.slice(lastFenceIndex)

  const nodes: ReactNode[] = []

  if (completeSection.length > 0) {
    nodes.push(renderMarkdown(completeSection, options))
  }

  if (pendingSection.length > 0) {
    nodes.push(pendingSection)
  }

  if (nodes.length === 1) {
    return nodes[0]
  }

  return React.createElement(React.Fragment, null, ...nodes)
}
