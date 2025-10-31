import { TextAttributes } from '@opentui/core'
import { describe, expect, test } from 'bun:test'
import React from 'react'

import {
  renderMarkdown,
  renderStreamingMarkdown,
} from '../markdown-renderer'

const flattenNodes = (input: React.ReactNode): React.ReactNode[] => {
  const result: React.ReactNode[] = []

  const visit = (value: React.ReactNode): void => {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'boolean'
    ) {
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (React.isValidElement(value) && value.type === React.Fragment) {
      visit(value.props.children)
      return
    }

    result.push(value)
  }

  visit(input)
  return result
}

const flattenChildren = (value: React.ReactNode): React.ReactNode[] =>
  flattenNodes(value)

describe('markdown renderer', () => {
  test('renders bold and italic emphasis', () => {
    const output = renderMarkdown('Hello **bold** and *italic*!')
    const nodes = flattenNodes(output)

    expect(nodes[0]).toBe('Hello ')

    const bold = nodes[1] as React.ReactElement
    expect(bold.props.attributes).toBe(TextAttributes.BOLD)
    expect(flattenChildren(bold.props.children)).toEqual(['bold'])

    expect(nodes[2]).toBe(' and ')

    const italic = nodes[3] as React.ReactElement
    expect(italic.props.attributes).toBe(TextAttributes.ITALIC)
    expect(flattenChildren(italic.props.children)).toEqual(['italic'])

    expect(nodes[4]).toBe('!')
  })

  test('renders inline code with palette colors', () => {
    const output = renderMarkdown('Use `ls` to list files.')
    const nodes = flattenNodes(output)

    expect(nodes[0]).toBe('Use ')

    const inlineCode = nodes[1] as React.ReactElement
    expect(inlineCode.props.fg).toBe('brightYellow')
    expect(inlineCode.props.bg).toBe('#0d1117')
    expect(flattenChildren(inlineCode.props.children)).toEqual([' ls '])

    expect(nodes[2]).toBe(' to list files.')
  })

  test('renders headings with color and bold attribute', () => {
    const output = renderMarkdown('# Heading One')
    const nodes = flattenNodes(output)

    const heading = nodes[0] as React.ReactElement
    expect(heading.props.attributes).toBe(TextAttributes.BOLD)
    expect(heading.props.fg).toBe('magenta')
    expect(flattenChildren(heading.props.children)).toEqual(['Heading One'])
  })

  test('renders inline emphasis inside headings without extra spacing', () => {
    const output = renderMarkdown(
      '# Other**.github/** - GitHub workflows and config',
    )
    const nodes = flattenNodes(output)

    const heading = nodes[0] as React.ReactElement
    const contents = flattenChildren(heading.props.children)

    expect(contents[0]).toBe('Other')

    const strong = contents[1] as React.ReactElement
    expect(strong.props.attributes).toBe(TextAttributes.BOLD)
    expect(flattenChildren(strong.props.children)).toEqual(['.github/'])

    expect(contents[2]).toBe(' - GitHub workflows and config')
  })

  test('renders blockquotes with prefix', () => {
    const output = renderMarkdown('> note')
    const nodes = flattenNodes(output)

    const prefixSpan = nodes[0] as React.ReactElement
    expect(prefixSpan.props.fg).toBe('gray')
    expect(flattenChildren(prefixSpan.props.children)).toEqual(['> '])

    const textSpan = nodes[1] as React.ReactElement
    expect(textSpan.props.fg).toBe('gray')
    expect(flattenChildren(textSpan.props.children)).toEqual(['note'])
  })

  test('renders lists with bullet markers', () => {
    const output = renderMarkdown('- first\n- second')
    const nodes = flattenNodes(output)

    const bulletSpans = nodes.filter(
      (node): node is React.ReactElement =>
        React.isValidElement(node) &&
        node.type === 'span' &&
        flattenChildren(node.props.children).join('') === '- ',
    )

    expect(bulletSpans).toHaveLength(2)
    bulletSpans.forEach((span) => expect(span.props.fg).toBe('white'))

    const textNodes = nodes
      .filter((node): node is string => typeof node === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
    expect(textNodes).toContain('first')
    expect(textNodes).toContain('second')
  })

  test('renders markdown without closing code fence while streaming', () => {
    const content = '**done**\n```js\nconsole.log('
    const output = renderStreamingMarkdown(content)
    const nodes = flattenNodes(output)

    const boldNode = nodes.find(
      (node): node is React.ReactElement =>
        React.isValidElement(node) &&
        node.props !== undefined &&
        node.props.attributes === TextAttributes.BOLD,
    )

    expect(boldNode).toBeDefined()
    expect(flattenChildren(boldNode!.props.children)).toEqual(['done'])
    expect(nodes[nodes.length - 1]).toBe('```js\nconsole.log(')
  })

  test('renders strikethrough text with GFM', () => {
    const output = renderMarkdown('This is ~~deleted~~ text')
    const nodes = flattenNodes(output)

    expect(nodes[0]).toBe('This is ')

    const strikethrough = nodes[1] as React.ReactElement
    expect(strikethrough.props.attributes).toBe(TextAttributes.DIM)
    expect(flattenChildren(strikethrough.props.children)).toEqual(['deleted'])

    expect(nodes[2]).toBe(' text')
  })

  test('renders task lists with GFM', () => {
    const output = renderMarkdown('- [ ] Todo\n- [x] Done')
    const nodes = flattenNodes(output)

    const checkboxSpans = nodes.filter(
      (node): node is React.ReactElement =>
        React.isValidElement(node) &&
        node.type === 'span' &&
        (flattenChildren(node.props.children).join('') === '[ ] ' ||
          flattenChildren(node.props.children).join('') === '[x] '),
    )

    expect(checkboxSpans).toHaveLength(2)
  })

  test('renders tables with GFM', () => {
    const markdown = `| Name | Age |
| ---- | --- |
| John | 30  |
| Jane | 25  |`
    const output = renderMarkdown(markdown)
    const nodes = flattenNodes(output)

    // Check that table structure is rendered (pipes and separators)
    const textContent = nodes
      .map((node) => {
        if (typeof node === 'string') return node
        if (React.isValidElement(node)) {
          return flattenChildren(node.props.children).join('')
        }
        return ''
      })
      .join('')

    expect(textContent).toContain('Name')
    expect(textContent).toContain('Age')
    expect(textContent).toContain('John')
    expect(textContent).toContain('Jane')
    expect(textContent).toContain('30')
    expect(textContent).toContain('25')
    expect(textContent).toContain('|')
    expect(textContent).toContain('---')
  })
})
