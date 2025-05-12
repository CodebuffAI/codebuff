import { describe, it, expect } from 'bun:test'
import { parseAttributes } from '../process-stream'

describe('parseAttributes', () => {
  it('should parse simple attributes', () => {
    const result = parseAttributes('name="value" id="123"', ['name', 'id'])
    expect(result).toEqual({
      name: 'value',
      id: '123'
    })
  })

  it('should ignore attributes not in attributeNames', () => {
    const result = parseAttributes('name="value" other="ignored"', ['name'])
    expect(result).toEqual({
      name: 'value'
    })
  })

  it('should handle extra whitespace', () => {
    const result = parseAttributes('  name  =  "value"    id="123"  ', ['name', 'id'])
    expect(result).toEqual({
      name: 'value',
      id: '123'
    })
  })

  it('should handle empty attribute values', () => {
    const result = parseAttributes('name="" id=""', ['name', 'id'])
    expect(result).toEqual({
      name: '',
      id: ''
    })
  })

  it('should handle attributes with special characters', () => {
    const result = parseAttributes('path="x=1&y=2" query="a>b"', ['path', 'query'])
    expect(result).toEqual({
      path: 'x=1&y=2',
      query: 'a>b'
    })
  })

  it('should handle attributes with spaces in values', () => {
    const result = parseAttributes('name="John Doe" title="Senior Developer"', ['name', 'title'])
    expect(result).toEqual({
      name: 'John Doe',
      title: 'Senior Developer'
    })
  })

  it('should handle malformed attributes', () => {
    const result = parseAttributes('name=value id="123"', ['name', 'id'])
    expect(result).toEqual({
      id: '123'
      // name should be missing because it's malformed
    })
  })

  it('should handle empty attribute string', () => {
    const result = parseAttributes('', ['name', 'id'])
    expect(result).toEqual({})
  })

  it('should handle backslashes in attribute values', () => {
    const result = parseAttributes('path="C:\\folder\\file.txt" id="123"', ['path', 'id'])
    expect(result).toEqual({
      path: 'C:\\folder\\file.txt',
      id: '123'
    })
  })

  it('should handle attributes with line breaks in values', () => {
    const result = parseAttributes('content="line1\nline2" id="123"', ['content', 'id'])
    expect(result).toEqual({
      content: 'line1\nline2',
      id: '123'
    })
  })

  it('should handle attributes with same prefix', () => {
    const result = parseAttributes('test="1" testing="2"', ['test', 'testing'])
    expect(result).toEqual({
      test: '1',
      testing: '2'
    })
  })

  it('should handle repeated attributes', () => {
    const result = parseAttributes('id="1" name="test" id="2"', ['id', 'name'])
    expect(result).toEqual({
      id: '2',  // Last value wins
      name: 'test'
    })
  })

  it('should handle unicode characters in values', () => {
    const result = parseAttributes('name="🙂 José" lang="español"', ['name', 'lang'])
    expect(result).toEqual({
      name: '🙂 José',
      lang: 'español'
    })
  })
})