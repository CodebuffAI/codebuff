import { describe, expect, it } from 'bun:test'
import { toolSchema } from 'common/constants/tools'
import { processStreamWithTags } from '../xml-stream-parser'

describe('processStreamWithTags', () => {
  async function* createMockStream(chunks: string[]) {
    for (const chunk of chunks) {
      yield chunk
    }
  }

  it('should handle basic tag parsing', async () => {
    const streamChunks = ['<test>', '<param>', 'content', '</param>', '</test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: `end`, params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        params: { param: 'content' },
        tagName: 'test',
        type: 'end',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should parse tag attributes', async () => {
    const streamChunks = [
      '<test name="value" id="123">',
      '<param>',
      'content',
      '</param>',
      '</test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param', 'name', 'id'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        tagName: 'test',
        type: 'start',
        attributes: { id: '123', name: 'value' },
      },
      {
        tagName: 'test',
        type: 'end',
        params: { id: '123', name: 'value', param: 'content' },
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle multiple tags', async () => {
    const streamChunks = [
      '<tag1><param1>content1</param1></tag1>',
      'text between tags',
      '<tag2><param2>content2</param2></tag2>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      tag1: {
        params: ['param1'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
      tag2: {
        params: ['param2'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'tag1',
        type: 'start',
      },
      {
        params: {
          param1: 'content1',
        },
        tagName: 'tag1',
        type: 'end',
      },
      {
        attributes: {},
        tagName: 'tag2',
        type: 'start',
      },
      {
        params: {
          param2: 'content2',
        },
        tagName: 'tag2',
        type: 'end',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle split tags across chunks', async () => {
    const streamChunks = [
      '<te',
      'st><pa',
      'ram>con',
      'tent</param',
      '></te',
      'st>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      { tagName: 'test', type: 'end', params: { param: 'content' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle early completion', async () => {
    const streamChunks = [
      '<test><param>content</param></test>',
      'should not process this',
      '<test><param>more content</param></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        params: {
          param: 'content',
        },
        tagName: 'test',
        type: 'end',
      },
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        params: {
          param: 'more content',
        },
        tagName: 'test',
        type: 'end',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle nested content with same tag name', async () => {
    const streamChunks = [
      '<test><param>outer </param><test><param>inner</param></test> content</test>',
    ]

    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        error:
          'WARN: New tool started while parsing tool test. Ending current tool. Make sure to close all tool calls!',
        name: 'test',
      },
      {
        params: {
          param: 'outer ',
        },
        tagName: 'test',
        type: 'end',
      },
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        params: {
          param: 'inner',
        },
        tagName: 'test',
        type: 'end',
      },
      {
        error:
          'WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!',
        name: 'test',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle EOF without closing tag', async () => {
    const streamChunks = ['<test><param>content']

    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      {
        error:
          'WARN: Found end of stream while parsing parameter. Make sure to close all parameters!',
        name: 'param',
      },
      {
        error:
          'WARN: Found end of stream while parsing tool. Make sure to close all tools!',
        name: 'test',
      },
      { tagName: 'test', type: 'end', params: { param: 'content' } },
    ])
    expect(result).toEqual([...streamChunks, '</param>\n', '</test>\n'])
  })

  it('should handle malformed attributes', async () => {
    const streamChunks = [
      '<test space name=malformed id="123" value=\'><param>content</param></test><test novalue></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        error: 'Attribute names may not contain whitespace: space',
        name: 'test',
      },
      {
        error: 'Attribute values should be quoted: name=malformed',
        name: 'test',
      },
      {
        error: "Unclosed attribute value: value='",
        name: 'test',
      },
      {
        attributes: {
          id: '123',
        },
        tagName: 'test',
        type: 'start',
      },
      {
        error:
          'WARN: Ignoring extra parameters found in test attributes: ["id"]. Make sure to only use parameters defined in the tool!',
        name: 'test',
      },
      {
        params: { param: 'content' },
        tagName: 'test',
        type: 'end',
      },
      {
        error: 'Expected a value for the attribute: novalue',
        name: 'test',
      },
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        params: {},
        tagName: 'test',
        type: 'end',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle empty tags', async () => {
    const streamChunks = ['<test><param></param></test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      { tagName: 'test', type: 'end', params: { param: '' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle whitespace in tags', async () => {
    const streamChunks = [
      '<test   name="value"   ><param>  content  </param></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['name', 'param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: { name: 'value' } },
      {
        tagName: 'test',
        type: 'end',
        params: { name: 'value', param: '  content  ' },
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle extraneous attributes', async () => {
    const streamChunks = [
      '<test name="value quoted here" id="123"><param>content</param></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {
          id: '123',
          name: 'value quoted here',
        },
        tagName: 'test',
        type: 'start',
      },
      {
        error:
          'WARN: Ignoring extra parameters found in test attributes: ["name","id"]. Make sure to only use parameters defined in the tool!',
        name: 'test',
      },
      {
        params: { param: 'content' },
        tagName: 'test',
        type: 'end',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle multiple chunks within tag content', async () => {
    const streamChunks = [
      '<test><param>first ',
      'second ',
      'third</param></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      { tagName: 'test', type: 'end', params: { param: 'first second third' } },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle unregistered tags', async () => {
    const streamChunks = ['<unknown>ignored</unknown>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        error:
          'WARN: Ignoring non-tool XML tag. Make sure to escape non-tool XML!',
        name: 'unknown',
      },
      {
        error:
          'WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!',
        name: 'unknown',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle special characters in content', async () => {
    const streamChunks = [
      '<test><param>content with <>&"\' special chars</param></test>',
    ]
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      {
        tagName: 'test',
        type: 'end',
        params: { param: 'content with <>&"\' special chars' },
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle attributes with equals signs in values', async () => {
    const streamChunks = ['<test path="x=1&y=2"><param>content</param></test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['path', 'param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {
          path: 'x=1&y=2',
        },
        tagName: 'test',
        type: 'start',
      },
      {
        params: {
          path: 'x=1&y=2',
          param: 'content',
        },
        tagName: 'test',
        type: 'end',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle newlines in content', async () => {
    const streamChunks = ['<test><param>line1\nline2\r\nline3</param></test>']
    const stream = createMockStream(streamChunks)

    const events: any[] = []

    const processors = {
      test: {
        params: ['param'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        params: { param: 'line1\nline2\r\nline3' },
        tagName: 'test',
        type: 'end',
      },
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      {
        tagName: 'test',
        type: 'end',
        params: { param1: 'value1', param2: 'value2' },
      },
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      {
        tagName: 'test',
        type: 'end',
        params: { param1: 'value1', param2: 'value2' },
      },
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }

    function onError(name: string, error: string) {
      events.push({ name, error })
    }

    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }

    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'test',
        type: 'start',
      },
      {
        error:
          'WARN: Ignoring stray XML tag. Make sure to escape non-tool XML!',
        name: 'invalid',
      },
      {
        error:
          'WARN: Ignoring text in test between parameters. Make sure to only put text within parameters!',
        name: 'test',
      },
      {
        error:
          'WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!',
        name: 'invalid',
      },

      {
        params: {
          param1: 'value1',
        },
        tagName: 'test',
        type: 'end',
      },
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }
    function onError(name: string, error: string) {
      events.push({ name, error })
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      { tagName: 'test', type: 'end', params: { param1: 'value1' } },
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }
    function onError(name: string, error: string) {
      events.push({ name, error })
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      {
        tagName: 'test',
        type: 'end',
        params: { param1: '', param2: 'value2' },
      },
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }
    function onError(name: string, error: string) {
      events.push({ name, error })
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      { tagName: 'test', type: 'start', attributes: {} },
      {
        tagName: 'test',
        type: 'end',
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }
    function onError(name: string, error: string) {
      events.push({ name, error })
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      {
        tagName: 'test',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'test',
        type: 'end',
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
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }
    function onError(name: string, error: string) {
      events.push({ name, error })
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      {
        tagName: 'test',
        type: 'start',
        attributes: {},
      },
      {
        tagName: 'test',
        type: 'end',
        params: { param1: 'value with <>&"\' chars' },
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle parameters with special characters in values', async () => {
    const streamChunks = [
      '<str_replace>\n',
      '<path>test.txt',
      '</path>\n',
      '<old>test</content>test',
      '2</old>\n',
      '<new>test</content',
      '>test2</new',
      '>\n</str_',
      'replace>\n',
    ]
    const stream = createMockStream(streamChunks)
    const events: any[] = []
    const processors = {
      str_replace: {
        params: ['path', 'old', 'new'] as string[],
        onTagStart: (tagName: string, attributes: Record<string, string>) => {
          events.push({ tagName, type: 'start', attributes })
        },
        onTagEnd: (tagName: string, params: Record<string, string>) => {
          events.push({ tagName, type: 'end', params })
        },
      },
    }
    function onError(name: string, error: string) {
      events.push({ name, error })
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'str_replace',
        type: 'start',
      },
      {
        error:
          'WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!',
        name: 'content',
      },
      {
        error:
          'WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!',
        name: 'content',
      },

      {
        params: {
          new: 'test</content>test2',
          old: 'test</content>test2',
          path: 'test.txt',
        },
        tagName: 'str_replace',
        type: 'end',
      },
    ])
    expect(result).toEqual(streamChunks)
  })

  it('should handle real world example', async () => {
    const streamChunks = [
      'I notice there\'s still an issue with the test dependencies. Let me fix that by removing the unused openai-go import and run the tests again:\n\n<write_file>\n<path>acp/internal/server/server_test.go</path>\n<content>package server\n\nimport (\n\t"bytes"\n\t"context"\n\t"encoding/json"\n\t"net/http"\n\t"net/http/httptest"\n\t"testing"\n\t"time"\n\n\t"github.com/gin-gonic/gin"\n\t"github.com/stretchr/testify/assert"\n\t"github.com/stretchr/testify/require"\n\tacp "github.com/humanlayer/agentcontrolplane/acp/api/v1alpha1"\n\tmetav1 "k8s.io/apimachinery/pkg/apis/meta/v1"\n\t"k8s.io/apimachinery/pkg/runtime"\n\t"sigs.k8s.io/controller-runtime/pkg/client"\n\t"sigs.k8s.io/controller-runtime/pkg/client/fake"\n)\n\nfunc TestCreateAgentWithServers(t *testing.T) {\n\t// Create a fake client with the scheme\n\tscheme := runtime.NewScheme()\n\tacp.AddToScheme(scheme)\n\tfakeClient := fake.NewClientBuilder().WithScheme(scheme).Build()\n\n\t// Create API server\n\tserver := NewAPIServer(fakeClient, ":8082")\n\n\t// Create test request\n\treqBody := CreateAgentWithServersRequest{\n\t\tAgent: acp.AgentSpec{\n\t\t\tSystem: "You are a helpful assistant",\n\t\t\tLLMRef: acp.LocalObjectReference{Name: "test-llm"},\n\t\t},\n\t\tServers: []MCPServerSpec{\n\t\t\t{\n\t\t\t\tName:      "test-server",\n\t\t\t\tTransport: "stdio",\n\t\t\t\tCommand:   "test-command",\n\t\t\t\tArgs:     []string{"arg1", "arg2"},\n\t\t\t},\n\t\t},\n\t}\n\n\tbody, err := json.Marshal(reqBody)\n\trequire.NoError(t, err)\n\n\tw := httptest.NewRecorder()\n\tc, _ := gin.CreateTestContext(w)\n\tc.Request = httptest.NewRequest("POST", "/v1/agent-with-servers", bytes.NewReader(body))\n\tc.Request.Header.Set("Content-Type", "application/json")\n\n\t// Call the handler\n\tserver.createAgentWithServers(c)\n\n\t// Check response\n\tassert.Equal(t, http.StatusCreated, w.Code)\n\n\tvar response map[string]interface{}\n\terr = json.Unmarshal(w.Body.Bytes(), &response)\n\trequire.NoError(t, err)\n\n\t// Verify agent name is returned\n\tassert.Contains(t, response, "agentName")\n\tassert.Contains(t, response, "message")\n\tassert.Equal(t, "Agent and MCP servers created successfully", response["message"])\n\n\t// Verify resources were created\n\tvar mcpServer acp.MCPServer\n\terr = fakeClient.Get(context.Background(), client.ObjectKey{\n\t\tName:      "test-server",\n\t\tNamespace: "default",\n\t}, &mcpServer)\n\tassert.NoError(t, err)\n\tassert.Equal(t, "stdio", mcpServer.Spec.Transport)\n\tassert.Equal(t, "test-command", mcpServer.Spec.Command)\n\n\tvar agent acp.Agent\n\terr = fakeClient.Get(context.Background(), client.ObjectKey{\n\t\tName:      response["agentName"].(string),\n\t\tNamespace: "default",\n\t}, &agent)\n\tassert.NoError(t, err)\n\tassert.Equal(t, "You are a helpful assistant", agent.Spec.System)\n\tassert.Len(t, agent.Spec.MCPServers, 1)\n\tassert.Equal(t, "test-server", agent.Spec.MCPServers[0].Name)\n}\n\nfunc TestStreamAgentStatus(t *testing.T) {\n\t// Create a fake client with the scheme\n\tscheme := runtime.NewScheme()\n\tacp.AddToScheme(scheme)\n\t\n\t// Create test agent and server\n\tagent := &acp.Agent{\n\t\tObjectMeta: metav1.ObjectMeta{\n\t\t\tName:      "test-agent",\n\t\t\tNamespace: "default",\n\t\t},\n\t\tSpec: acp.AgentSpec{\n\t\t\tSystem: "Test system",\n\t\t\tMCPServers: []acp.LocalObjectReference{\n\t\t\t\t{Name: "test-server"},\n\t\t\t},\n\t\t},\n\t\tStatus: acp.AgentStatus{\n\t\t\tReady: true,\n\t\t\tStatus: acp.AgentStatusReady,\n\t\t},\n\t}\n\n\tmcpServer := &acp.MCPServer{\n\t\tObjectMeta: metav1.ObjectMeta{\n\t\t\tName:      "test-server",\n\t\t\tNamespace: "default",\n\t\t},\n\t\tStatus: acp.MCPServerStatus{\n\t\t\tConnected: true,\n\t\t\tStatus:    "Ready",\n\t\t\tTools: []acp.MCPTool{\n\t\t\t\t{Name: "test-tool"},\n\t\t\t},\n\t\t},\n\t}\n\n\tfakeClient := fake.NewClientBuilder().\n\t\tWithScheme(scheme).\n\t\tWithObjects(agent, mcpServer).\n\t\tBuild()\n\n\t// Create API server\n\tserver := NewAPIServer(fakeClient, ":8082")\n\n\t// Create test context\n\tw := httptest.NewRecorder()\n\tc, _ := gin.CreateTestContext(w)\n\tc.Request = httptest.NewRequest("GET", "/v1/agent-with-servers/test-agent/status", nil)\n\tc.Params = []gin.Param{{Key: "name", Value: "test-agent"}}\n\n\t// Create a context with timeout\n\tctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)\n\tdefer cancel()\n\tc.Request = c.Request.WithContext(ctx)\n\n\t// Call the handler\n\tserver.streamAgentStatus(c)\n\n\t// Check response headers\n\tassert.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))\n\tassert.Equal(t, "no-cache", w.Header().Get("Cache-Control"))\n\tassert.Equal(t, "keep-alive", w.Header().Get("Connection"))\n\n\t// Check response body contains SSE format\n\tbody := w.Body.String()\n\tassert.Contains(t, body, "event: status\\n")\n\tassert.Contains(t, body, "data: {")\n\t\n\t// Parse the response data\n\tlines := bytes.Split(w.Body.Bytes(), []byte("\\n"))\n\tvar dataLine string\n\tfor _, line := range lines {\n\t\tif bytes.HasPrefix(line, []byte("data: ")) {\n\t\t\tdataLine = string(bytes.TrimPrefix(line, []byte("data: ")))\n\t\t\tbreak\n\t\t}\n\t}\n\n\tvar response AgentWithServersStatusResponse\n\terr := json.Unmarshal([]byte(dataLine), &response)\n\trequire.NoError(t, err)\n\n\t// Verify response content\n\tassert.Equal(t, "test-agent", response.AgentName)\n\tassert.True(t, response.AgentStatus.Ready)\n\tassert.Equal(t, acp.AgentStatusReady, response.AgentStatus.Status)\n\tassert.Len(t, response.ServerStatuses, 1)\n\tassert.Equal(t, "test-server", response.ServerStatuses[0].Name)\n\tassert.True(t, response.ServerStatuses[0].Connected)\n\tassert.Equal(t, "Ready", response.ServerStatuses[0].Status)\n\tassert.Len(t, response.ServerStatuses[0].Tools, 1)\n\tassert.Equal(t, "test-tool", response.ServerStatuses[0].Tools[0].Name)\n}\n\nfunc TestValidateMCPServerSpec(t *testing.T) {\n\tserver := ',
      '&APIServer',
      '{}\n\n\ttests := []struct {\n\t\tname    string\n\t\tspec    MCPServerSpec\n\t\twantErr bool\n\t\terrMsg  string\n\t}{\n\t\t{\n\t\t\tname: "valid stdio server",\n\t\t\tspec: MCPServerSpec{\n\t\t\t\tName:      "test-server",\n\t\t\t\tTransport: "stdio",\n\t\t\t\tCommand:   "test-command",\n\t\t\t},\n\t\t\twantErr: false,\n\t\t},\n\t\t{\n\t\t\tname: "valid http server",\n\t\t\tspec: MCPServerSpec{\n\t\t\t\tName:      "test-server",\n\t\t\t\tTransport: "http",\n\t\t\t\tURL:      "http://localhost:8080",\n\t\t\t},\n\t\t\twantErr: false,\n\t\t},\n\t\t{\n\t\t\tname: "missing name",\n\t\t\tspec: MCPServerSpec{\n\t\t\t\tTransport: "stdio",\n\t\t\t\tCommand:   "test-command",\n\t\t\t},\n\t\t\twantErr: true,\n\t\t\terrMsg:  "server name is required",\n\t\t},\n\t\t{\n\t\t\tname: "invalid transport",\n\t\t\tspec: MCPServerSpec{\n\t\t\t\tName:      "test-server",\n\t\t\t\tTransport: "invalid",\n\t\t\t},\n\t\t\twantErr: true,\n\t\t\terrMsg:  "invalid transport type",\n\t\t},\n\t\t{\n\t\t\tname: "stdio missing command",\n\t\t\tspec: MCPServerSpec{\n\t\t\t\tName:      "test-server",\n\t\t\t\tTransport: "stdio",\n\t\t\t},\n\t\t\twantErr: true,\n\t\t\terrMsg:  "command is required for stdio transport",\n\t\t},\n\t\t{\n\t\t\tname: "http missing url",\n\t\t\tspec: MCPServerSpec{\n\t\t\t\tName:      "test-server",\n\t\t\t\tTransport: "http",\n\t\t\t},\n\t\t\twantErr: true,\n\t\t\terrMsg:  "URL is required for http transport",\n\t\t},\n\t}\n\n\tfor _, tt := range tests {\n\t\tt.Run(tt.name, func(t *testing.T) {\n\t\t\terr := server.validateMCPServerSpec(tt.spec)\n\t\t\tif tt.wantErr {\n\t\t\t\tassert.Error(t, err)\n\t\t\t\tassert.Contains(t, err.Error(), tt.errMsg)\n\t\t\t} else {\n\t\t\t\tassert.NoError(t, err)\n\t\t\t}\n\t\t})\n\t}\n}\n</content>\n</write_file>\n\n<run_terminal_command>\n<command>cd acp && go test -v ./internal/server</command>\n',
    ]
    const stream = createMockStream(streamChunks)
    const events: any[] = []
    const processors = Object.fromEntries(
      Object.entries(toolSchema).map(([tool, params]) => [
        tool,
        {
          params,
          onTagStart: (tagName: string, attributes: Record<string, string>) =>
            events.push({ tagName, type: 'start', attributes }),
          onTagEnd: (tagName: string, params: Record<string, string>) =>
            events.push({ tagName, type: 'end', params }),
        },
      ])
    )
    function onError(name: string, error: string) {
      events.push({ name, error })
    }
    const result = []
    for await (const chunk of processStreamWithTags(
      stream,
      processors,
      onError
    )) {
      result.push(chunk)
    }
    expect(events).toEqual([
      {
        attributes: {},
        tagName: 'write_file',
        type: 'start',
      },
      {
        params: {
          content:
            'package server\n\nimport (\n\t"bytes"\n\t"context"\n\t"encoding/json"\n\t"net/http"\n\t"net/http/httptest"\n\t"testing"\n\t"time"\n\n\t"github.com/gin-gonic/gin"\n\t"github.com/stretchr/testify/assert"\n\t"github.com/stretchr/testify/require"\n\tacp "github.com/humanlayer/agentcontrolplane/acp/api/v1alpha1"\n\tmetav1 "k8s.io/apimachinery/pkg/apis/meta/v1"\n\t"k8s.io/apimachinery/pkg/runtime"\n\t"sigs.k8s.io/controller-runtime/pkg/client"\n\t"sigs.k8s.io/controller-runtime/pkg/client/fake"\n)\n\nfunc TestCreateAgentWithServers(t *testing.T) {\n\t// Create a fake client with the scheme\n\tscheme := runtime.NewScheme()\n\tacp.AddToScheme(scheme)\n\tfakeClient := fake.NewClientBuilder().WithScheme(scheme).Build()\n\n\t// Create API server\n\tserver := NewAPIServer(fakeClient, ":8082")\n\n\t// Create test request\n\treqBody := CreateAgentWithServersRequest{\n\t\tAgent: acp.AgentSpec{\n\t\t\tSystem: "You are a helpful assistant",\n\t\t\tLLMRef: acp.LocalObjectReference{Name: "test-llm"},\n\t\t},\n\t\tServers: []MCPServerSpec{\n\t\t\t{\n\t\t\t\tName:      "test-server",\n\t\t\t\tTransport: "stdio",\n\t\t\t\tCommand:   "test-command",\n\t\t\t\tArgs:     []string{"arg1", "arg2"},\n\t\t\t},\n\t\t},\n\t}\n\n\tbody, err := json.Marshal(reqBody)\n\trequire.NoError(t, err)\n\n\tw := httptest.NewRecorder()\n\tc, _ := gin.CreateTestContext(w)\n\tc.Request = httptest.NewRequest("POST", "/v1/agent-with-servers", bytes.NewReader(body))\n\tc.Request.Header.Set("Content-Type", "application/json")\n\n\t// Call the handler\n\tserver.createAgentWithServers(c)\n\n\t// Check response\n\tassert.Equal(t, http.StatusCreated, w.Code)\n\n\tvar response map[string]interface{}\n\terr = json.Unmarshal(w.Body.Bytes(), &response)\n\trequire.NoError(t, err)\n\n\t// Verify agent name is returned\n\tassert.Contains(t, response, "agentName")\n\tassert.Contains(t, response, "message")\n\tassert.Equal(t, "Agent and MCP servers created successfully", response["message"])\n\n\t// Verify resources were created\n\tvar mcpServer acp.MCPServer\n\terr = fakeClient.Get(context.Background(), client.ObjectKey{\n\t\tName:      "test-server",\n\t\tNamespace: "default",\n\t}, &mcpServer)\n\tassert.NoError(t, err)\n\tassert.Equal(t, "stdio", mcpServer.Spec.Transport)\n\tassert.Equal(t, "test-command", mcpServer.Spec.Command)\n\n\tvar agent acp.Agent\n\terr = fakeClient.Get(context.Background(), client.ObjectKey{\n\t\tName:      response["agentName"].(string),\n\t\tNamespace: "default",\n\t}, &agent)\n\tassert.NoError(t, err)\n\tassert.Equal(t, "You are a helpful assistant", agent.Spec.System)\n\tassert.Len(t, agent.Spec.MCPServers, 1)\n\tassert.Equal(t, "test-server", agent.Spec.MCPServers[0].Name)\n}\n\nfunc TestStreamAgentStatus(t *testing.T) {\n\t// Create a fake client with the scheme\n\tscheme := runtime.NewScheme()\n\tacp.AddToScheme(scheme)\n\t\n\t// Create test agent and server\n\tagent := &acp.Agent{\n\t\tObjectMeta: metav1.ObjectMeta{\n\t\t\tName:      "test-agent",\n\t\t\tNamespace: "default",\n\t\t},\n\t\tSpec: acp.AgentSpec{\n\t\t\tSystem: "Test system",\n\t\t\tMCPServers: []acp.LocalObjectReference{\n\t\t\t\t{Name: "test-server"},\n\t\t\t},\n\t\t},\n\t\tStatus: acp.AgentStatus{\n\t\t\tReady: true,\n\t\t\tStatus: acp.AgentStatusReady,\n\t\t},\n\t}\n\n\tmcpServer := &acp.MCPServer{\n\t\tObjectMeta: metav1.ObjectMeta{\n\t\t\tName:      "test-server",\n\t\t\tNamespace: "default",\n\t\t},\n\t\tStatus: acp.MCPServerStatus{\n\t\t\tConnected: true,\n\t\t\tStatus:    "Ready",\n\t\t\tTools: []acp.MCPTool{\n\t\t\t\t{Name: "test-tool"},\n\t\t\t},\n\t\t},\n\t}\n\n\tfakeClient := fake.NewClientBuilder().\n\t\tWithScheme(scheme).\n\t\tWithObjects(agent, mcpServer).\n\t\tBuild()\n\n\t// Create API server\n\tserver := NewAPIServer(fakeClient, ":8082")\n\n\t// Create test context\n\tw := httptest.NewRecorder()\n\tc, _ := gin.CreateTestContext(w)\n\tc.Request = httptest.NewRequest("GET", "/v1/agent-with-servers/test-agent/status", nil)\n\tc.Params = []gin.Param{{Key: "name", Value: "test-agent"}}\n\n\t// Create a context with timeout\n\tctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)\n\tdefer cancel()\n\tc.Request = c.Request.WithContext(ctx)\n\n\t// Call the handler\n\tserver.streamAgentStatus(c)\n\n\t// Check response headers\n\tassert.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))\n\tassert.Equal(t, "no-cache", w.Header().Get("Cache-Control"))\n\tassert.Equal(t, "keep-alive", w.Header().Get("Connection"))\n\n\t// Check response body contains SSE format\n\tbody := w.Body.String()\n\tassert.Contains(t, body, "event: status\\n")\n\tassert.Contains(t, body, "data: {")\n\t\n\t// Parse the response data\n\tlines := bytes.Split(w.Body.Bytes(), []byte("\\n"))\n\tvar dataLine string\n\tfor _, line := range lines {\n\t\tif bytes.HasPrefix(line, []byte("data: ")) {\n\t\t\tdataLine = string(bytes.TrimPrefix(line, []byte("data: ")))\n\t\t\tbreak\n\t\t}\n\t}\n\n\tvar response AgentWithServersStatusResponse\n\terr := json.Unmarshal([]byte(dataLine), &response)\n\trequire.NoError(t, err)\n\n\t// Verify response content\n\tassert.Equal(t, "test-agent", response.AgentName)\n\tassert.True(t, response.AgentStatus.Ready)\n\tassert.Equal(t, acp.AgentStatusReady, response.AgentStatus.Status)\n\tassert.Len(t, response.ServerStatuses, 1)\n\tassert.Equal(t, "test-server", response.ServerStatuses[0].Name)\n\tassert.True(t, response.ServerStatuses[0].Connected)\n\tassert.Equal(t, "Ready", response.ServerStatuses[0].Status)\n\tassert.Len(t, response.ServerStatuses[0].Tools, 1)\n\tassert.Equal(t, "test-tool", response.ServerStatuses[0].Tools[0].Name)\n}\n\nfunc TestValidateMCPServerSpec(t *testing.T) {\n\tserver := ',
          path: 'acp/internal/server/server_test.go',
        },
        tagName: 'write_file',
        type: 'end',
      },
      {
        attributes: {},
        tagName: 'run_terminal_command',
        type: 'start',
      },
      {
        error:
          'WARN: Found end of stream while parsing tool. Make sure to close all tools!',
        name: 'run_terminal_command',
      },

      {
        params: {
          command: 'cd acp && go test -v ./internal/server',
        },
        tagName: 'run_terminal_command',
        type: 'end',
      },
    ])
    expect(result).toEqual([...streamChunks, '</run_terminal_command>\n'])
  })
})
