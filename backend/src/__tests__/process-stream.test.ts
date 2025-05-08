import { describe, expect, it } from 'bun:test'
import { processStreamWithTags } from '../process-stream'

describe('processStreamWithTags', () => {
  async function* createMockStream(chunks: string[]) {
    for (const chunk of chunks) {
      yield chunk
    }
  }

  it('should handle basic tag parsing', async () => {
    const streamChunks = ['<test>', 'content', '</test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param1', 'param2'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should parse tag attributes', async () => {
    const streamChunks = ['<test name="value" id="123">', 'content', '</test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: { id: '123', name: 'value' } },
      { type: 'testEnd', params: { id: '123', name: 'value' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle multiple tags', async () => {
    const streamChunks = [
      '<tag1>content1</tag1>',
      'text between tags',
      '<tag2>content2</tag2>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      tag1: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'tag1Start', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'tag1End', params })
        },
      },
      tag2: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'tag2Start', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'tag2End', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'tag1Start', attributes: {} },
      { type: 'tag1End', params: {} },
      { type: 'tag2Start', attributes: {} },
      { type: 'tag2End', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle split tags across chunks', async () => {
    const streamChunks = ['<te', 'st>con', 'tent</te', 'st>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle early completion', async () => {
    const streamChunks = [
      '<test>content</test>',
      'should not process this',
      '<test>more content</test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle nested content with same tag name', async () => {
    const streamChunks = ['<test>outer <test>inner</test> content</test>']

    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'defaultStart', tagName: 'test', attributes: {} },
      { type: 'testEnd', params: {} },
      { type: 'defaultEnd', tagName: 'test' },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle EOF without closing tag', async () => {
    const streamChunks = ['<test>content']

    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle malformed attributes', async () => {
    const streamChunks = [
      '<test space name=malformed id="123" value=\'>content</test><test novalue></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>, errors: string[]) => {
          events.push({ type: 'testStart', attributes, errors })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        type: 'testStart',
        attributes: {
          id: '123',
        },
        errors: [
          'Attribute names may not contain whitespace: space',
          'Attribute values should be quoted: name=malformed',
          "Unclosed attribute value: value='",
        ],
      },
      { type: 'testEnd', params: { id: '123' } },
      {
        type: 'testStart',
        attributes: {},
        errors: ['Expected a value for the attribute: novalue'],
      },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle empty tags', async () => {
    const streamChunks = ['<test></test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle whitespace in tags', async () => {
    const streamChunks = ['<test   name="value"   >  content  </test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: { name: 'value' } },
      { type: 'testEnd', params: { name: 'value' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle multiple attributes with quotes in values', async () => {
    const streamChunks = [
      '<test name="value quoted here" id="123">content</test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        type: 'testStart',
        attributes: { name: 'value quoted here', id: '123' },
      },
      { type: 'testEnd', params: { name: 'value quoted here', id: '123' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle multiple chunks within tag content', async () => {
    const streamChunks = ['<test>first ', 'second ', 'third</test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should ignore unregistered tags', async () => {
    const streamChunks = ['<unknown>ignored</unknown>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'defaultStart', tagName: 'unknown', attributes: {} },
      { type: 'defaultEnd', tagName: 'unknown' },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle special characters in content', async () => {
    const streamChunks = ['<test>content with <>&"\' special chars</test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle attributes with equals signs in values', async () => {
    const streamChunks = ['<test path="x=1&y=2">content</test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: { path: 'x=1&y=2' } },
      { type: 'testEnd', params: { path: 'x=1&y=2' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle newlines in content', async () => {
    const streamChunks = ['<test>line1\nline2\r\nline3</test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: [] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: {} },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle tags with parameters', async () => {
    const streamChunks = [
      '<test>',
      '<param1>value1</param1>',
      '<param2>value2</param2>',
      '</test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param1', 'param2'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: { param1: 'value1', param2: 'value2' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle split parameter tags across chunks', async () => {
    const streamChunks = [
      '<test><par',
      'am1>val',
      'ue1</param1><param2>value2</param2></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param1', 'param2'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: { param1: 'value1', param2: 'value2' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle invalid parameter tags as content', async () => {
    const streamChunks = [
      '<test>',
      '<invalid>value</invalid>',
      '<param1>value1</param1>',
      '</test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param1', 'param2'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }

    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'defaultStart', tagName: 'invalid', attributes: {} },
      { type: 'defaultEnd', tagName: 'invalid' },
      { type: 'testEnd', params: { param1: 'value1' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle missing parameters', async () => {
    const streamChunks = ['<test><param1>value1</param1></test>']
    const stream = createMockStream(streamChunks)
    const events: any[] = []
    const processors = {
      test: {
        params: ['param1', 'param2'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }
    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: { param1: 'value1' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle parameters with empty values', async () => {
    const streamChunks = [
      '<test><param1></param1><param2>value2</param2></test>',
    ]
    const stream = createMockStream(streamChunks)
    const events: any[] = []
    const processors = {
      test: {
        params: ['param1', 'param2'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }
    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      { type: 'testEnd', params: { param1: '', param2: 'value2' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle XML entities', async () => {
    const streamChunks = [
      '<test><param1>value with &lt;&gt;&amp;&quot;&apos; entities &amp;amp;</param1></test>',
    ]
    const stream = createMockStream(streamChunks)
    const events: any[] = []
    const processors = {
      test: {
        params: ['param1'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }
    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      {
        type: 'testEnd',
        params: { param1: 'value with <>&"\' entities &amp;' },
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle split XML entities', async () => {
    const streamChunks = [
      '<test><param1>value with &l',
      't;&g',
      't;&am',
      'p;&quo',
      't;&',
      'apos; entities &amp;am',
      'p;</param1></test>',
    ]
    const stream = createMockStream(streamChunks)
    const events: any[] = []
    const processors = {
      test: {
        params: ['param1'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }
    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      {
        type: 'testEnd',
        params: { param1: 'value with <>&"\' entities &amp;' },
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle parameters with special characters in values', async () => {
    const streamChunks = [
      '<test><param1>value with <>&"\' chars</param1></test>',
    ]
    const stream = createMockStream(streamChunks)
    const events: any[] = []
    const processors = {
      test: {
        params: ['param1'] as string[],
        onTagStart: (attributes: Record<string, string>) => {
          events.push({ type: 'testStart', attributes })
        },
        onTagEnd: (params: Record<string, string>) => {
          events.push({ type: 'testEnd', params })
        },
      },
    }
    const defaultProcessor = {
      onTagStart: (tagName: string, attributes: Record<string, string>) => {
        events.push({ type: 'defaultStart', tagName, attributes })
      },
      onTagEnd: (tagName: string) => {
        events.push({ type: 'defaultEnd', tagName })
      },
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      defaultProcessor
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { type: 'testStart', attributes: {} },
      {
        type: 'testEnd',
        params: { param1: 'value with <>&"\' chars' },
      },
    ])
    expect(result).toEqual(streamChunks)
  })
})
