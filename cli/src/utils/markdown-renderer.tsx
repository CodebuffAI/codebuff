import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { logger } from './logger'

import type {
  Blockquote,
  Code,
  Content,
  Heading,
  InlineCode,
  List,
  ListItem,
  Paragraph,
  Root,
  Text,
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

function nodeToPlainText(node: Content | Root): string {
  switch (node.type) {
    case 'root':
      return (node as Root).children.map(nodeToPlainText).join('')

    case 'paragraph':
      return (node as Paragraph).children.map(nodeToPlainText).join('') + '\n\n'

    case 'text':
      return (node as Text).value

    case 'inlineCode':
      return `\`${(node as InlineCode).value}\``

    case 'heading': {
      const heading = node as Heading
      const prefix = '#'.repeat(Math.max(1, Math.min(heading.depth, 6)))
      const content = heading.children.map(nodeToPlainText).join('')
      return `${prefix} ${content}\n\n`
    }

    case 'list': {
      const list = node as List
      return (
        list.children
          .map((item, idx) => {
            const marker = list.ordered ? `${idx + 1}. ` : '- '
            const text = (item as ListItem).children
              .map(nodeToPlainText)
              .join('')
              .trimEnd()
            return marker + text
          })
          .join('\n') + '\n\n'
      )
    }

    case 'listItem': {
      const listItem = node as ListItem
      return listItem.children.map(nodeToPlainText).join('')
    }

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

    default:
      return ''
  }
}

export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): string {
  try {
    const palette = resolvePalette(options.palette)
    void palette // Keep signature compatibility for future color styling

    const ast = processor.parse(markdown)
    const text = nodeToPlainText(ast).replace(/\s+$/g, '')
    return text
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
): string {
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

  const parts: string[] = []

  if (completeSection.length > 0) {
    parts.push(renderMarkdown(completeSection, options))
  }

  if (pendingSection.length > 0) {
    parts.push(pendingSection)
  }

  return parts.join('')
}
