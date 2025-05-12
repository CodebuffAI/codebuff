import { describe, it, expect } from 'bun:test'
import { processStreamWithTags } from '../process-stream'

describe('processStreamWithTags', () => {
  async function* createMockStream(chunks: string[]) {
    for (const chunk of chunks) {
      yield chunk
    }
  }

  it('should handle basic tag parsing', async () => {
    const stream = createMockStream(['<test>', 'content', '</test>'])

    let tagStartCalled = false
    let tagEndContent = ''
    let tagEndAttributes: Record<string, string> = {}

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {
          tagStartCalled = true
        },
        onTagEnd: (content: string, attributes: Record<string, string>) => {
          tagEndContent = content
          tagEndAttributes = attributes
          return false
        },
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(stream, tags)) {
      result.push(chunk)
    }

    expect(tagStartCalled).toBe(true)
    expect(tagEndContent).toBe('content')
    expect(tagEndAttributes).toEqual({})
  })

  it('should parse tag attributes', async () => {
    const stream = createMockStream([
      '<test name="value" id="123">',
      'content',
      '</test>',
    ])

    let tagEndAttributes: Record<string, string> = {}

    const tags = {
      test: {
        attributeNames: ['name', 'id'],
        onTagStart: () => {},
        onTagEnd: (content: string, attributes: Record<string, string>) => {
          tagEndAttributes = attributes
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndAttributes).toEqual({
      name: 'value',
      id: '123',
    })
  })

  it('should handle multiple tags', async () => {
    const stream = createMockStream([
      '<tag1>content1</tag1>',
      'text between tags',
      '<tag2>content2</tag2>',
    ])

    const contents: Record<string, string> = {}

    const tags = {
      tag1: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          contents.tag1 = content
          return false
        },
      },
      tag2: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          contents.tag2 = content
          return false
        },
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(stream, tags)) {
      result.push(chunk)
    }

    expect(contents).toEqual({
      tag1: 'content1',
      tag2: 'content2',
    })
    expect(result).toContain('text between tags')
  })

  it('should handle split tags across chunks', async () => {
    const stream = createMockStream(['<te', 'st>con', 'tent</te', 'st>'])

    let tagEndContent = ''

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          tagEndContent = content
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndContent).toBe('content')
  })

  it('should handle early completion', async () => {
    const stream = createMockStream([
      '<test>content</test>',
      'should not process this',
      '<test>more content</test>',
    ])

    let firstTagProcessed = false

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: () => {
          if (!firstTagProcessed) {
            firstTagProcessed = true
            return true // Complete after first tag
          }
          return false
        },
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(stream, tags)) {
      result.push(chunk)
    }

    expect(result).not.toContain('should not process this')
    expect(firstTagProcessed).toBe(true)
  })

  it('should handle nested content with same tag name', async () => {
    const stream = createMockStream([
      '<test>outer <test>inner</test> content</test>',
    ])

    const contents: string[] = []

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          contents.push(content)
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    // The implementation treats inner tags as content, not as nested tags
    expect(contents).toEqual(['outer <test>inner'])
  })

  it('should handle EOF without closing tag', async () => {
    const stream = createMockStream([
      '<test>content',
      // No closing tag
    ])

    let tagEndContent = ''

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          tagEndContent = content
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndContent).toBe('content')
  })

  it('should handle malformed attributes', async () => {
    const stream = createMockStream([
      '<test name=malformed id="123">content</test>',
    ])

    let tagEndAttributes: Record<string, string> = {}

    const tags = {
      test: {
        attributeNames: ['name', 'id'],
        onTagStart: () => {},
        onTagEnd: (content: string, attributes: Record<string, string>) => {
          tagEndAttributes = attributes
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    // Should only parse properly formatted attributes
    expect(tagEndAttributes).toEqual({
      id: '123',
    })
  })

  it('should handle empty tags', async () => {
    const stream = createMockStream(['<test></test>'])

    let tagEndContent = ''

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          tagEndContent = content
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndContent).toBe('')
  })

  it('should handle whitespace in tags', async () => {
    const stream = createMockStream([
      '<test   name="value"   >  content  </test>',
    ])

    let tagEndContent = ''
    let tagEndAttributes: Record<string, string> = {}

    const tags = {
      test: {
        attributeNames: ['name'],
        onTagStart: () => {},
        onTagEnd: (content: string, attributes: Record<string, string>) => {
          tagEndContent = content
          tagEndAttributes = attributes
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndContent).toBe('  content  ')
    expect(tagEndAttributes).toEqual({ name: 'value' })
  })

  it('should handle multiple attributes with quotes in values', async () => {
    const stream = createMockStream([
      '<test name="value quoted here" id="123">content</test>',
    ])

    let tagEndAttributes: Record<string, string> = {}

    const tags = {
      test: {
        attributeNames: ['name', 'id'],
        onTagStart: () => {},
        onTagEnd: (content: string, attributes: Record<string, string>) => {
          tagEndAttributes = attributes
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndAttributes).toEqual({
      name: 'value quoted here',
      id: '123',
    })
  })

  it('should handle multiple chunks within tag content', async () => {
    const stream = createMockStream(['<test>first ', 'second ', 'third</test>'])

    let tagEndContent = ''

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          tagEndContent = content
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndContent).toBe('first second third')
  })

  it('should ignore unregistered tags', async () => {
    const stream = createMockStream(['<unknown>ignored</unknown>'])

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          return false
        },
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(stream, tags)) {
      result.push(chunk)
    }

    expect(result.join('')).toBe('<unknown>ignored</unknown>')
  })

  it('should handle special characters in content', async () => {
    const stream = createMockStream([
      '<test>content with <>&"\' special chars</test>',
    ])

    let tagEndContent = ''

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          tagEndContent = content
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndContent).toBe('content with <>&"\' special chars')
  })

  it('should handle attributes with equals signs in values', async () => {
    const stream = createMockStream(['<test path="x=1&y=2">content</test>'])

    let tagEndAttributes: Record<string, string> = {}

    const tags = {
      test: {
        attributeNames: ['path'],
        onTagStart: () => {},
        onTagEnd: (content: string, attributes: Record<string, string>) => {
          tagEndAttributes = attributes
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndAttributes).toEqual({
      path: 'x=1&y=2',
    })
  })

  it('should handle newlines in content', async () => {
    const stream = createMockStream(['<test>line1\nline2\r\nline3</test>'])

    let tagEndContent = ''

    const tags = {
      test: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          tagEndContent = content
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(tagEndContent).toBe('line1\nline2\r\nline3')
  })

  it('should handle multiple registered tags with same prefix', async () => {
    const stream = createMockStream([
      '<test1>content1</test1><test2>content2</test2>',
    ])

    const contents: Record<string, string> = {}

    const tags = {
      test1: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          contents.test1 = content
          return false
        },
      },
      test2: {
        attributeNames: [],
        onTagStart: () => {},
        onTagEnd: (content: string) => {
          contents.test2 = content
          return false
        },
      },
    }

    for await (const _ of processStreamWithTags(stream, tags)) {
      // consume stream
    }

    expect(contents).toEqual({
      test1: 'content1',
      test2: 'content2',
    })
  })
})
