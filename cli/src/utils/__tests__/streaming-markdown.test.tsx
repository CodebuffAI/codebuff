import { describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { renderStreamingMarkdown } from '../markdown-renderer'
import {
  createStreamingMarkdownCache,
  renderStreamingMarkdownCached,
} from '../streaming-markdown'

import type { ReactNode } from 'react'

const WIDTH = 72
const HEIGHT = 90

const renderFrame = async (node: ReactNode): Promise<string> => {
  const setup = await createTestRenderer({ width: WIDTH, height: HEIGHT })
  const root = createRoot(setup.renderer)
  try {
    flushSync(() =>
      root.render(
        <box flexDirection="column">
          <text>{node as React.ReactNode}</text>
        </box>,
      ),
    )
    await setup.renderOnce()
    return setup.captureCharFrame()
  } finally {
    flushSync(() => root.unmount())
    setup.renderer.destroy()
  }
}

const DOC = `## Streaming equivalence

A paragraph with **bold**, *italic*, \`inline code\` and a [link](https://example.com).

- first bullet with \`code\`
- second bullet
- third bullet

1. ordered one
2. ordered two

> a quoted line
> with two lines

| column a | column b |
| -------- | -------- |
| value 1  | value 2  |

\`\`\`ts
export const answer = 42
function add(a: number, b: number) {
  return a + b
}
\`\`\`

A closing paragraph that mentions a < b and 5 > 3 as plain text.
`

/** Every prefix that ends at a line boundary, i.e. where a flush could land. */
const prefixEnds = (text: string): number[] => {
  const ends: number[] = []
  for (let i = 1; i < text.length; i++) {
    if (text[i] === '\n') ends.push(i + 1)
  }
  return ends
}

describe('renderStreamingMarkdownCached', () => {
  test('matches a full render at every streaming step', async () => {
    const cache = createStreamingMarkdownCache()
    const options = { codeBlockWidth: 72 }

    for (const end of prefixEnds(DOC)) {
      const content = DOC.slice(0, end)
      const expected = await renderFrame(renderStreamingMarkdown(content, options))
      const actual = await renderFrame(
        renderStreamingMarkdownCached(content, options, cache),
      )

      // Guard against a vacuous pass: an empty or error frame would compare
      // equal to another empty frame.
      expect(expected).toContain('Streaming equivalence')
      expect({ at: end, frame: actual }).toEqual({ at: end, frame: expected })
    }
  })

  test('matches a full render inside an unterminated code fence', async () => {
    const cache = createStreamingMarkdownCache()
    const options = { codeBlockWidth: 72 }
    const open = `Intro text.\n\n\`\`\`ts\nconst a = 1\nconst b = 2\n`

    const expected = await renderFrame(renderStreamingMarkdown(open, options))
    const actual = await renderFrame(
      renderStreamingMarkdownCached(open, options, cache),
    )

    expect(expected).toContain('const a = 1')
    expect(actual).toEqual(expected)
  })

  test('a paragraph directly followed by a list keeps the same spacing', async () => {
    const cache = createStreamingMarkdownCache()
    const options = { codeBlockWidth: 72 }
    const content = `Intro line.\n\n- one\n- two\n\nAfter the list.\n`

    const expected = await renderFrame(renderStreamingMarkdown(content, options))
    const actual = await renderFrame(
      renderStreamingMarkdownCached(content, options, cache),
    )

    expect(expected).toContain('After the list.')
    expect(actual).toEqual(expected)
  })

  test('replaced content re-renders from scratch', async () => {
    const cache = createStreamingMarkdownCache()
    const options = { codeBlockWidth: 72 }

    renderStreamingMarkdownCached(DOC, options, cache)

    const replacement = `# A different message\n\nWith **its own** body.\n`
    const expected = await renderFrame(
      renderStreamingMarkdown(replacement, options),
    )
    const actual = await renderFrame(
      renderStreamingMarkdownCached(replacement, options, cache),
    )

    expect(expected).toContain('A different message')
    expect(actual).toEqual(expected)
  })

  test('a width change invalidates the cached prefix', async () => {
    const cache = createStreamingMarkdownCache()

    renderStreamingMarkdownCached(DOC, { codeBlockWidth: 72 }, cache)

    const expected = await renderFrame(
      renderStreamingMarkdown(DOC, { codeBlockWidth: 40 }),
    )
    const actual = await renderFrame(
      renderStreamingMarkdownCached(DOC, { codeBlockWidth: 40 }, cache),
    )

    expect(expected).toContain('Streaming equivalence')
    expect(actual).toEqual(expected)
  })
})
