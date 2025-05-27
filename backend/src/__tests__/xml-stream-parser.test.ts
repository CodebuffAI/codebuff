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
          'WARN: Found end of stream while parsing parameter. End of parameter appended to response. Make sure to close all parameters!',
        name: 'param',
      },
      {
        error:
          'INFO: Found end of stream while parsing tool. End of tool appended to response. The stop sequence may have been omitted. Make sure to end tools in the future!',
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
          'WARN: Tool not found. Make sure to escape non-tool XML! e.g. &lt;invalid&gt;',
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

  it('should handle shortened real world example', async () => {
    const streamChunks = [
      "I notice there's still an issue with the test dependencies. Let me fix that by removing the unused openai-go import and run the tests again:\n\n<write_file>\n<path>acp/internal/server/server_test.go</path>\n<content> {\n\tserver := ",
      '&APIServer\n</content',
      '>\n</write_file>\n\n<run_terminal_command>\n<command>cd acp && go test -v ./internal/server</command>\n</run_terminal_command>\n',
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
    for (const event of events) {
      expect(event).not.toHaveProperty('error')
      expect(result).toEqual(streamChunks)
    }
  })

  it('should ignore new parameters while parsing current parameter', async () => {
    const streamChunks = [
      '<test><param1>value1<param2 attr="123" >ignored</param2>still param1</param1></test>',
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
        error:
          'WARN: Parameter found while parsing param param1 of test. Ignoring new parameter. Make sure to close all params and escape XML!',
        name: 'test',
      },
      {
        error:
          'WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!',
        name: 'param2',
      },
      {
        tagName: 'test',
        type: 'end',
        params: {
          param1: 'value1<param2 attr="123" >ignored</param2>still param1',
        },
      },
    ])
    expect(result).toEqual(streamChunks)
  })
})
