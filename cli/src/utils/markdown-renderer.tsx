import { TextAttributes } from '@opentui/core'
import React from 'react'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { logger } from './logger'

import type {
  Blockquote,
  Code,
  Content,
  Emphasis,
  Heading,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  Root,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
} from 'mdast'
import type { ReactNode } from 'react'

// Helper component to work around TypeScript's Fragment key typing issue
const KeyedFragment = React.Fragment as React.FC<{ key?: string | number; children?: ReactNode }>

// Helper to wrap segments in KeyedFragments
const wrapSegmentsInFragments = (
  segments: ReactNode[],
  keyPrefix: string,
): ReactNode => {
  return segments.map((segment, idx) => (
    <KeyedFragment key={keyPrefix + '-' + idx}>{segment}</KeyedFragment>
  ))
}

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
  codeBlockWidth?: number
}

const defaultPalette: MarkdownPalette = {
  inlineCodeFg: '#86efac',
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

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)

type MarkdownNode = Content | Root

type InlineFallbackNode = Text | Strong | Emphasis

interface RenderState {
  palette: MarkdownPalette
  codeBlockWidth: number
  nextKey: () => string
}

const createRenderState = (
  palette: MarkdownPalette,
  codeBlockWidth: number,
): RenderState => {
  let counter = 0
  return {
    palette,
    codeBlockWidth,
    nextKey: () => {
      counter += 1
      return `markdown-${counter}`
    },
  }
}

// Unified trim helper with predicate
const trimTrailingNodes = (
  nodes: ReactNode[],
  predicate: (node: ReactNode) => boolean,
): ReactNode[] => {
  let end = nodes.length
  while (end > 0 && predicate(nodes[end - 1])) {
    end -= 1
  }
  return end === nodes.length ? nodes : nodes.slice(0, end)
}

const trimTrailingWhitespaceNodes = (nodes: ReactNode[]): ReactNode[] => {
  return trimTrailingNodes(
    nodes,
    (node) => typeof node === 'string' && node.trim().length === 0,
  )
}

const trimTrailingBreaks = (nodes: ReactNode[]): ReactNode[] => {
  return trimTrailingNodes(
    nodes,
    (node) => typeof node === 'string' && /^\n+$/.test(node),
  )
}

const splitNodesByNewline = (nodes: ReactNode[]): ReactNode[][] => {
  const lines: ReactNode[][] = [[]]
  nodes.forEach((node) => {
    if (typeof node === 'string') {
      const parts = node.split('\n')
      parts.forEach((part, idx) => {
        if (part.length > 0) {
          lines[lines.length - 1].push(part)
        }
        if (idx < parts.length - 1) {
          lines.push([])
        }
      })
    } else {
      lines[lines.length - 1].push(node)
    }
  })
  return lines
}

const hasUnescapedMarker = (value: string): boolean => {
  if (!value) {
    return false
  }
  const markers = ['**', '*']
  return markers.some((marker) => {
    let idx = value.indexOf(marker)
    while (idx !== -1) {
      let backslashes = 0
      for (let offset = idx - 1; offset >= 0 && value[offset] === '\\'; offset -= 1) {
        backslashes += 1
      }
      if (backslashes % 2 === 0) {
        return true
      }
      idx = value.indexOf(marker, idx + marker.length)
    }
    return false
  })
}

const findClosingDelimiter = (
  value: string,
  start: number,
  marker: string,
): number => {
  let idx = start
  while (idx < value.length) {
    idx = value.indexOf(marker, idx)
    if (idx === -1) {
      return -1
    }
    let backslashes = 0
    for (let offset = idx - 1; offset >= 0 && value[offset] === '\\'; offset -= 1) {
      backslashes += 1
    }
    if (backslashes % 2 === 0) {
      return idx
    }
    idx += marker.length
  }
  return -1
}

/**
 * Remark follows CommonMark's emphasis rules, which ignore some practical
 * patterns (e.g., `Other**.github/**`). This fallback splits leftover text
 * nodes on emphasis markers so we still render inline styling in those cases.
 */
const parseInlineFallback = (value: string): InlineFallbackNode[] => {
  if (!value || !hasUnescapedMarker(value)) {
    return [{ type: 'text', value }]
  }

  const nodes: InlineFallbackNode[] = []
  let buffer = ''

  const flushBuffer = () => {
    if (buffer.length > 0) {
      nodes.push({ type: 'text', value: buffer })
      buffer = ''
    }
  }

  let index = 0
  while (index < value.length) {
    const char = value[index]

    if (char === '*') {
      const markerChar = char
      const isDouble =
        index + 1 < value.length && value[index + 1] === markerChar
      const marker = isDouble ? markerChar.repeat(2) : markerChar
      const markerLength = marker.length

      let backslashes = 0
      for (
        let offset = index - 1;
        offset >= 0 && value[offset] === '\\';
        offset -= 1
      ) {
        backslashes += 1
      }

      if (backslashes % 2 === 1) {
        buffer += marker
        index += markerLength
        continue
      }

      const closing = findClosingDelimiter(value, index + markerLength, marker)
      if (closing === -1) {
        buffer += marker
        index += markerLength
        continue
      }

      const inner = value.slice(index + markerLength, closing)
      flushBuffer()
      const children = parseInlineFallback(inner).filter(
        (node) => !(node.type === 'text' && node.value.length === 0),
      )

      const emphasisNode: InlineFallbackNode =
        isDouble
          ? { type: 'strong', children }
          : { type: 'emphasis', children }

      nodes.push(emphasisNode)
      index = closing + markerLength
      continue
    }

    buffer += char
    index += 1
  }

  flushBuffer()

  if (nodes.length === 0) {
    return [{ type: 'text', value }]
  }

  return nodes
}

const applyInlineFallbackFormatting = (node: MarkdownNode): void => {
  if (!node || typeof node !== 'object') {
    return
  }

  const mutable = node as { children?: MarkdownNode[] }
  if (!Array.isArray(mutable.children)) {
    return
  }

  const nextChildren: MarkdownNode[] = []

  mutable.children.forEach((child) => {
    if (child.type === 'text') {
      const replacements = parseInlineFallback(child.value)
      const hasChanges =
        replacements.length !== 1 ||
        replacements[0].type !== 'text' ||
        replacements[0].value !== child.value

      if (hasChanges) {
        replacements.forEach((replacement) => {
          if (replacement.type === 'text') {
            nextChildren.push(replacement)
          } else {
            applyInlineFallbackFormatting(
              replacement as unknown as MarkdownNode,
            )
            nextChildren.push(replacement as unknown as MarkdownNode)
          }
        })
        return
      }
    } else {
      applyInlineFallbackFormatting(child as MarkdownNode)
    }

    nextChildren.push(child as MarkdownNode)
  })

  mutable.children = nextChildren
}

const getChildrenText = (children: MarkdownNode[]): string => {
  return children.map(nodeToPlainText).join('')
}

const nodeToPlainText = (node: MarkdownNode): string => {
  switch (node.type) {
    case 'root':
      return getChildrenText((node as Root).children as MarkdownNode[])

    case 'paragraph':
      return getChildrenText((node as Paragraph).children as MarkdownNode[]) + '\n\n'

    case 'text':
      return (node as Text).value

    case 'strong':
      return getChildrenText((node as Strong).children as MarkdownNode[])

    case 'emphasis':
      return getChildrenText((node as Emphasis).children as MarkdownNode[])

    case 'inlineCode':
      return (node as InlineCode).value

    case 'heading': {
      const heading = node as Heading
      const prefix = '#'.repeat(Math.max(1, Math.min(heading.depth, 6)))
      const content = getChildrenText(heading.children as MarkdownNode[])
      return `${prefix} ${content}\n\n`
    }

    case 'list': {
      const list = node as List
      return (
        list.children
          .map((item, idx) => {
            const marker = list.ordered ? `${(list.start ?? 1) + idx}. ` : '- '
            const text = getChildrenText((item as ListItem).children as MarkdownNode[]).trimEnd()
            return marker + text
          })
          .join('\n') + '\n\n'
      )
    }

    case 'listItem':
      return getChildrenText((node as ListItem).children as MarkdownNode[])

    case 'blockquote': {
      const blockquote = node as Blockquote
      const content = blockquote.children
        .map((child) => nodeToPlainText(child).replace(/^/gm, '> '))
        .join('')
      return `${content}\n\n`
    }

    case 'code': {
      const code = node as Code
      const header = code.lang ? `\`\`\`${code.lang}\n` : '```\n'
      return `${header}${code.value}\n\`\`\`\n\n`
    }

    case 'break':
      return '\n'

    case 'thematicBreak':
      return '---\n\n'

    case 'link': {
      const link = node as Link
      const label = link.children.length > 0
        ? getChildrenText(link.children as MarkdownNode[])
        : link.url
      return label
    }

    case 'table': {
      const table = node as Table
      return table.children
        .map((row) => {
          const cells = (row as TableRow).children as TableCell[]
          return cells.map((cell) => nodeToPlainText(cell)).join(' | ')
        })
        .join('\n') + '\n\n'
    }

    case 'tableRow':
      return (node as TableRow).children.map(nodeToPlainText).join(' | ')

    case 'tableCell':
      return getChildrenText((node as TableCell).children as MarkdownNode[])

    case 'delete': {
      // Strikethrough - just return the text content
      const deleteNode = node as any
      if (Array.isArray(deleteNode.children)) {
        return getChildrenText(deleteNode.children as MarkdownNode[])
      }
      return ''
    }

    default: {
      const anyNode = node as any
      if (Array.isArray(anyNode.children)) {
        return getChildrenText(anyNode.children as MarkdownNode[])
      }
      return ''
    }
  }
}

const renderNodes = (
  children: MarkdownNode[],
  state: RenderState,
  parentType: MarkdownNode['type'],
): ReactNode[] => {
  const results: ReactNode[] = []
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    const nextSibling = children[index + 1] as MarkdownNode | undefined
    results.push(...renderNode(child, state, parentType, nextSibling))
  }
  return results
}

const renderCodeBlock = (code: Code, state: RenderState): ReactNode[] => {
  const { palette, nextKey } = state
  const lines = code.value.split('\n')
  const nodes: ReactNode[] = []

  if (code.lang) {
    nodes.push(
      <span key={nextKey()} fg={palette.codeHeaderFg}>
        {`// ${code.lang}`}
      </span>,
      '\n',
    )
  }

  lines.forEach((line, index) => {
    const displayLine = line === '' ? ' ' : line
    nodes.push(
      <span
        key={nextKey()}
        fg={palette.codeTextFg}
        bg={palette.codeMonochrome ? undefined : palette.codeBackground}
      >
        {displayLine}
      </span>,
    )
    if (index < lines.length - 1) {
      nodes.push('\n')
    }
  })

  nodes.push('\n\n')
  return nodes
}

const renderBlockquote = (
  blockquote: Blockquote,
  state: RenderState,
): ReactNode[] => {
  const { palette, nextKey } = state
  const childNodes = renderNodes(
    blockquote.children as MarkdownNode[],
    state,
    blockquote.type,
  )
  const lines = splitNodesByNewline(childNodes)
  const nodes: ReactNode[] = []

  lines.forEach((line, index) => {
    if (line.length === 0) {
      return
    }
    nodes.push(
      <span key={nextKey()} fg={palette.blockquoteBorderFg}>
        {'> '}
      </span>,
    )
    nodes.push(
      <span key={nextKey()} fg={palette.blockquoteTextFg}>
        {wrapSegmentsInFragments(line, nextKey())}
      </span>,
    )
    if (index < lines.length - 1) {
      nodes.push('\n')
    }
  })

  nodes.push('\n\n')
  return nodes
}

const renderList = (list: List, state: RenderState): ReactNode[] => {
  const { palette, nextKey } = state
  const nodes: ReactNode[] = []
  const start = list.start ?? 1

  list.children.forEach((item, idx) => {
    const listItem = item as ListItem
    const marker =
      listItem.checked === true
        ? '[x] '
        : listItem.checked === false
          ? '[ ] '
          : list.ordered
            ? `${start + idx}. `
            : '- '

    nodes.push(
      <span key={nextKey()} fg={palette.listBulletFg}>
        {marker}
      </span>,
    )

    const itemNodes = trimTrailingBreaks(
      renderNodes(listItem.children as MarkdownNode[], state, listItem.type),
    )
    if (itemNodes.length === 0) {
      nodes.push('\n')
    } else {
      nodes.push(
        <KeyedFragment key={nextKey()}>
          {wrapSegmentsInFragments(itemNodes, nextKey())}
        </KeyedFragment>,
      )
      nodes.push('\n')
    }
  })

  if (nodes.length > 0) {
    nodes.push('\n')
  }

  return nodes
}

const renderHeading = (heading: Heading, state: RenderState): ReactNode[] => {
  const { palette, nextKey } = state
  const depth = Math.max(1, Math.min(heading.depth, 6))
  const color = palette.headingFg[depth] ?? palette.headingFg[6]
  const childNodes = renderNodes(
    heading.children as MarkdownNode[],
    state,
    heading.type,
  )

  return [
    <span key={nextKey()} fg={color} attributes={TextAttributes.BOLD}>
      {childNodes.map((segment, idx) => (
        <KeyedFragment key={nextKey() + '-' + idx}>{segment}</KeyedFragment>
      ))}
    </span>,
    '\n\n',
  ]
}

const renderInlineCode = (
  inlineCode: InlineCode,
  state: RenderState,
): ReactNode[] => {
  const { palette, nextKey } = state
  const content = inlineCode.value || ' '
  return [
    <span
      key={nextKey()}
      fg={palette.inlineCodeFg}
      bg={palette.codeMonochrome ? undefined : palette.codeBackground}
    >
      {` ${content} `}
    </span>,
  ]
}

const renderLink = (link: Link, state: RenderState): ReactNode[] => {
  const { palette, nextKey } = state
  const labelNodes = renderNodes(
    link.children as MarkdownNode[],
    state,
    link.type,
  )
  const label = labelNodes.length > 0 ? labelNodes : [link.url]

  return [
    <span key={nextKey()} fg={palette.inlineCodeFg}>
      {wrapSegmentsInFragments(label, nextKey())}
    </span>,
  ]
}

const renderTable = (table: Table, state: RenderState): ReactNode[] => {
  const { palette, nextKey } = state
  const nodes: ReactNode[] = []

  // Calculate column widths
  const columnWidths: number[] = []
  table.children.forEach((row) => {
    (row as TableRow).children.forEach((cell, colIdx) => {
      const cellText = nodeToPlainText(cell as TableCell)
      const width = cellText.length
      columnWidths[colIdx] = Math.max(columnWidths[colIdx] || 0, width)
    })
  })

  // Render each row
  table.children.forEach((row, rowIdx) => {
    const isHeader = rowIdx === 0
    const cells = (row as TableRow).children as TableCell[]

    // Render cells in the row
    cells.forEach((cell, cellIdx) => {
      const cellNodes = renderNodes(
        cell.children as MarkdownNode[],
        state,
        cell.type,
      )
      const cellWidth = columnWidths[cellIdx] || 10
      const cellText = nodeToPlainText(cell)
      const padding = ' '.repeat(Math.max(0, cellWidth - cellText.length))

      nodes.push(
        <span key={nextKey()} fg={isHeader ? palette.headingFg[3] : undefined}>
          {cellIdx === 0 ? '| ' : ' | '}
          {wrapSegmentsInFragments(cellNodes, nextKey())}
          {padding}
        </span>,
      )
    })
    nodes.push(' |\n')

    // Add separator line after header
    if (isHeader) {
      nodes.push('|')
      columnWidths.forEach((width, idx) => {
        nodes.push(idx === 0 ? ' ' : ' | ')
        nodes.push('-'.repeat(width))
      })
      nodes.push(' |\n')
    }
  })

  nodes.push('\n')
  return nodes
}

const renderNode = (
  node: MarkdownNode,
  state: RenderState,
  parentType: MarkdownNode['type'],
  nextSibling?: MarkdownNode,
): ReactNode[] => {
  switch (node.type) {
    case 'root':
      return renderNodes(
        (node as Root).children as MarkdownNode[],
        state,
        node.type,
      )

    case 'paragraph': {
      const children = renderNodes(
        (node as Paragraph).children as MarkdownNode[],
        state,
        node.type,
      )
      const nodes = [...children]
      if (parentType === 'listItem') {
        nodes.push('\n')
      } else if (parentType === 'blockquote') {
        nodes.push('\n')
      } else {
        const isTightFollowup =
          parentType === 'root' &&
          nextSibling &&
          (nextSibling.type === 'blockquote' || nextSibling.type === 'list')
        nodes.push(isTightFollowup ? '\n' : '\n\n')
      }
      return nodes
    }

    case 'text':
      return [(node as Text).value]

    case 'strong': {
      const children = renderNodes(
        (node as Strong).children as MarkdownNode[],
        state,
        node.type,
      )
      return [
        <span key={state.nextKey()} attributes={TextAttributes.BOLD}>
          {wrapSegmentsInFragments(children, state.nextKey())}
        </span>,
      ]
    }

    case 'emphasis': {
      const children = renderNodes(
        (node as Emphasis).children as MarkdownNode[],
        state,
        node.type,
      )
      return [
        <span key={state.nextKey()} attributes={TextAttributes.ITALIC}>
          {wrapSegmentsInFragments(children, state.nextKey())}
        </span>,
      ]
    }

    case 'inlineCode':
      return renderInlineCode(node as InlineCode, state)

    case 'heading':
      return renderHeading(node as Heading, state)

    case 'list':
      return renderList(node as List, state)

    case 'listItem': {
      return renderNodes(
        (node as ListItem).children as MarkdownNode[],
        state,
        node.type,
      )
    }

    case 'blockquote':
      return renderBlockquote(node as Blockquote, state)

    case 'code':
      return renderCodeBlock(node as Code, state)

    case 'break':
      return ['\n']

    case 'thematicBreak': {
      const width = Math.max(10, Math.min(state.codeBlockWidth, 80))
      const divider = '─'.repeat(width)
      return [
        <span key={state.nextKey()} fg={state.palette.dividerFg}>
          {divider}
        </span>,
        '\n\n',
      ]
    }

    case 'link':
      return renderLink(node as Link, state)

    case 'table':
      return renderTable(node as Table, state)

    case 'delete': {
      // Strikethrough from GFM
      const anyNode = node as any
      const children = renderNodes(
        anyNode.children as MarkdownNode[],
        state,
        node.type,
      )
      return [
        <span key={state.nextKey()} attributes={TextAttributes.DIM}>
          {wrapSegmentsInFragments(children, state.nextKey())}
        </span>,
      ]
    }

    default: {
      const fallbackText = nodeToPlainText(node)
      if (fallbackText) {
        return [fallbackText]
      }

      const anyNode = node as any
      if (Array.isArray(anyNode.children)) {
        return renderNodes(anyNode.children as MarkdownNode[], state, node.type)
      }

      return []
    }
  }
}

const normalizeOutput = (nodes: ReactNode[]): ReactNode => {
  const trimmed = trimTrailingWhitespaceNodes(nodes)
  if (trimmed.length === 0) {
    return ''
  }
  if (trimmed.length === 1) {
    return trimmed[0]
  }
  return (
    <>
      {trimmed.map((node, idx) => (
        <KeyedFragment key={`markdown-out-${idx}`}>{node}</KeyedFragment>
      ))}
    </>
  )
}

export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): ReactNode {
  try {
    const palette = resolvePalette(options.palette)
    const codeBlockWidth = options.codeBlockWidth ?? 80
    const state = createRenderState(palette, codeBlockWidth)
    const ast = processor.parse(markdown) as Root
    applyInlineFallbackFormatting(ast)
    const nodes = renderNode(ast, state, ast.type, undefined)
    return normalizeOutput(nodes)
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

const mergeStreamingSegments = (segments: ReactNode[]): ReactNode => {
  if (segments.length === 0) {
    return ''
  }
  if (segments.length === 1) {
    return segments[0]
  }

  return (
    <>
      {segments.map((segment, idx) => (
        <KeyedFragment key={`stream-segment-${idx}`}>
          {segment}
        </KeyedFragment>
      ))}
    </>
  )
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

  const segments: ReactNode[] = []

  if (completeSection.length > 0) {
    segments.push(renderMarkdown(completeSection, options))
  }

  if (pendingSection.length > 0) {
    segments.push(pendingSection)
  }

  return mergeStreamingSegments(segments)
}
