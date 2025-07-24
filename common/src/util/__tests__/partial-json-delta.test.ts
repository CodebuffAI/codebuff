import { describe, expect, it } from 'bun:test'

import {
  getPartialJsonDelta,
  parsePartialJsonObjectSingle,
} from '../partial-json-delta'

describe('parsePartialJsonObjectSingle', () => {
  describe('complete valid JSON', () => {
    it('should parse complete valid JSON', () => {
      const input = '{"name": "test", "value": 42}'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { name: 'test', value: 42 },
      })
    })

    it('should parse empty object', () => {
      const input = '{}'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({ lastParamComplete: true, params: {} })
    })

    it('should parse nested objects', () => {
      const input = '{"user": {"name": "John", "age": 30}}'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { user: { name: 'John', age: 30 } },
      })
    })

    it('should parse arrays', () => {
      const input = '{"items": [1, 2, 3]}'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { items: [1, 2, 3] },
      })
    })
  })

  describe('incomplete JSON - missing closing brace', () => {
    it('should parse object missing final closing brace', () => {
      const input = '{"name": "test", "value": 42'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { name: 'test' },
      })
    })

    it('should parse nested object missing final closing brace', () => {
      const input = '{"user": {"name": "John", "age": 30}'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { user: { name: 'John', age: 30 } },
      })
    })

    it('should parse object with incomplete string value', () => {
      const input = '{"name": "test", "incomplete": "partial'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: false,
        params: { name: 'test', incomplete: 'partial' },
      })
    })
  })

  describe('incomplete JSON - trailing comma handling', () => {
    it('should handle trailing comma by removing last property', () => {
      const input = '{"name": "test", "value": 42, "incomplete":'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { name: 'test', value: 42 },
      })
    })

    it('should handle multiple trailing commas', () => {
      const input = '{"a": 1, "b": 2, "c": 3, "d":'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { a: 1, b: 2, c: 3 },
      })
    })

    it('should handle nested object with trailing comma', () => {
      const input = '{"user": {"name": "John", "age": 30}, "incomplete":'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { user: { name: 'John', age: 30 } },
      })
    })

    it('should handle array with trailing comma', () => {
      const input = '{"items": [1, 2, 3], "incomplete":'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { items: [1, 2, 3] },
      })
    })
  })

  describe('edge cases', () => {
    it('should return empty object for empty string', () => {
      const input = ''
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({ lastParamComplete: true, params: {} })
    })

    it('should return empty object for invalid JSON', () => {
      const input = 'not json at all'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({ lastParamComplete: true, params: {} })
    })

    it('should return empty object for malformed JSON', () => {
      const input = '{"name": test}'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({ lastParamComplete: true, params: {} })
    })

    it('should handle JSON with only opening brace', () => {
      const input = '{'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({ lastParamComplete: true, params: {} })
    })

    it('should handle JSON with whitespace', () => {
      const input = '  {"name": "test"}  '
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { name: 'test' },
      })
    })

    it('should handle complex nested incomplete JSON', () => {
      const input =
        '{"data": {"users": [{"name": "John"}, {"name": "Jane"}], "count": 2}, "meta":'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: {
          data: {
            users: [{ name: 'John' }, { name: 'Jane' }],
            count: 2,
          },
        },
      })
    })
  })

  describe('real-world streaming scenarios', () => {
    it('should handle partial JSON from streaming response', () => {
      const input =
        '{"status": "processing", "progress": 0.5, "message": "Working on'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: false,
        params: {
          status: 'processing',
          progress: 0.5,
          message: 'Working on',
        },
      })
    })

    it('should handle JSON with boolean and null values', () => {
      const input =
        '{"active": true, "deleted": false, "metadata": null, "incomplete":'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { active: true, deleted: false, metadata: null },
      })
    })

    it('should handle JSON with numbers', () => {
      const input =
        '{"integer": 42, "float": 3.14, "negative": -10, "incomplete":'
      const result = parsePartialJsonObjectSingle(input)
      expect(result).toEqual({
        lastParamComplete: true,
        params: { integer: 42, float: 3.14, negative: -10 },
      })
    })
  })
})

describe('getPartialJsonDelta', () => {
  describe('input validation', () => {
    it('should throw error when content does not start with previous', () => {
      const content = '{"name": "test"}'
      const previous = '{"other": "value"}'

      expect(() => getPartialJsonDelta(content, previous)).toThrow(
        'Content must be previous content plus new content'
      )
    })

    it('should work when content starts with previous', () => {
      const content = '{"name": "test", "value": 42}'
      const previous = '{"name": "test"'

      expect(() => getPartialJsonDelta(content, previous)).not.toThrow()
    })
  })

  describe('basic delta detection from streaming JSON', () => {
    it('should detect new properties added to empty object', () => {
      const content = '{ "name": "test", "value": 42 }'
      const previous = '{'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ name: 'test', value: 42 })
      expect(result.result).toEqual({ name: 'test', value: 42 })
      expect(result.lastParam.key).toBe('value')
      expect(result.lastParam.complete).toBe(true)
    })

    it('should detect completion of partial string value', () => {
      const content = '{"name": "updated"}'
      const previous = '{"name": "upda'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ name: 'ted' })
      expect(result.result).toEqual({ name: 'updated' })
      expect(result.lastParam.key).toBe('name')
      expect(result.lastParam.complete).toBe(true)
    })

    it('should return empty delta when no changes detected', () => {
      const content = '{"name": "test", "value": 42}'
      const previous = '{"name": "test", "value": 42'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ value: 42 })
      expect(result.result).toEqual({ name: 'test', value: 42 })
      expect(result.lastParam.key).toBe('value')
      expect(result.lastParam.complete).toBe(true)
    })

    it('should detect new property being added', () => {
      const content = '{"name": "test", "value": 100}'
      const previous = '{"name": "test", "value": '
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ value: 100 })
      expect(result.result).toEqual({ name: 'test', value: 100 })
      expect(result.lastParam.key).toBe('value')
      expect(result.lastParam.complete).toBe(true)
    })
  })

  describe('string delta handling', () => {
    it('should return string slice for partial string updates', () => {
      const content = '{"message": "Hello World"}'
      const previous = '{"message": "Hello'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ message: ' World' })
      expect(result.result).toEqual({ message: 'Hello World' })
    })

    it('should handle empty string to non-empty string', () => {
      const content = '{"message": "Hello"}'
      const previous = '{"message": "'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ message: 'Hello' })
      expect(result.result).toEqual({ message: 'Hello' })
    })

    it('should handle new string property', () => {
      const content = '{"message": "Hello"}'
      const previous = '{'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ message: 'Hello' })
      expect(result.result).toEqual({ message: 'Hello' })
    })

    it('should handle multi-line string streaming', () => {
      const content = '{"text": "Line 1\\nLine 2\\nLine 3"}'
      const previous = '{"text": "Line 1\\nLine'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ text: ' 2\nLine 3' })
      expect(result.result).toEqual({ text: 'Line 1\nLine 2\nLine 3' })
    })
  })

  describe('non-string value changes', () => {
    it('should return full value for non-string changes', () => {
      const content = '{"count": 42}'
      const previous = '{"count": '
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ count: 42 })
      expect(result.result).toEqual({ count: 42 })
    })

    it('should handle boolean values', () => {
      const content = '{"active": true}'
      const previous = '{"active": '
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ active: true })
      expect(result.result).toEqual({ active: true })
    })

    it('should handle null values', () => {
      const content = '{"data": null}'
      const previous = '{"data": '
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ data: null })
      expect(result.result).toEqual({ data: null })
    })

    it('should handle array values', () => {
      const content = '{"items": [1, 2, 3]}'
      const previous = '{"items": '
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ items: [1, 2, 3] })
      expect(result.result).toEqual({ items: [1, 2, 3] })
    })

    it('should handle nested object values', () => {
      const content = '{"user": {"name": "John", "age": 30}}'
      const previous = '{"user": '
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ user: { name: 'John', age: 30 } })
      expect(result.result).toEqual({ user: { name: 'John', age: 30 } })
    })
  })

  describe('realistic streaming scenarios', () => {
    it('should handle progressive JSON building', () => {
      // Simulate streaming JSON construction
      let previous = '{'
      let content = '{"status": "processing"'
      let result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ status: 'processing' })
      expect(result.result).toEqual({ status: 'processing' })

      // Add more content
      previous = content
      content = '{"status": "processing", "progress": 0.5'
      result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({})
      expect(result.result).toEqual({ status: 'processing' })

      // Complete the JSON
      previous = content
      content =
        '{"status": "processing", "progress": 0.5, "message": "Almost done"}'
      result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ message: 'Almost done', progress: 0.5 })
      expect(result.result).toEqual({
        status: 'processing',
        progress: 0.5,
        message: 'Almost done',
      })
    })

    it('should handle streaming text completion', () => {
      const previous = '{"response": "The quick brown'
      const content =
        '{"response": "The quick brown fox jumps over the lazy dog"}'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ response: ' fox jumps over the lazy dog' })
      expect(result.result).toEqual({
        response: 'The quick brown fox jumps over the lazy dog',
      })
    })

    it('should handle incomplete JSON with trailing comma', () => {
      const previous = '{"name": "test", "value": 42,'
      const content = '{"name": "test", "value": 42, "status": "complete"}'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ status: 'complete' })
      expect(result.result).toEqual({
        name: 'test',
        value: 42,
        status: 'complete',
      })
    })
  })

  describe('lastParam tracking', () => {
    it('should track last parameter key and completion status', () => {
      const content = '{"name": "test", "value": 42}'
      const previous = '{'
      const result = getPartialJsonDelta(content, previous)

      expect(result.lastParam.key).toBe('value')
      expect(result.lastParam.complete).toBe(true)
    })

    it('should indicate incomplete last parameter', () => {
      const content = '{"name": "test", "message": "partial'
      const previous = '{'
      const result = getPartialJsonDelta(content, previous)

      expect(result.lastParam.key).toBe('message')
      expect(result.lastParam.complete).toBe(false)
    })

    it('should handle undefined key for empty object', () => {
      const content = '{}'
      const previous = '{'
      const result = getPartialJsonDelta(content, previous)

      expect(result.lastParam.key).toBeUndefined()
      expect(result.lastParam.complete).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty previous string', () => {
      const content = '{"name": "test"}'
      const previous = ''

      expect(() => getPartialJsonDelta(content, previous)).not.toThrow()
      const result = getPartialJsonDelta(content, previous)
      expect(result.delta).toEqual({ name: 'test' })
    })

    it('should handle identical content and previous', () => {
      const content = '{"name": "test"}'
      const previous = '{"name": "test"}'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({})
      expect(result.result).toEqual({ name: 'test' })
    })

    it('should handle malformed JSON gracefully', () => {
      const content = '{"name": test}' // Invalid JSON
      const previous = '{'
      const result = getPartialJsonDelta(content, previous)

      // Should return empty objects when JSON parsing fails
      expect(result.delta).toEqual({})
      expect(result.result).toEqual({})
    })

    it('should handle escaped quotes in strings', () => {
      const content = '{"message": "He said \\"Hello\\" to me"}'
      const previous = '{"message": "He said \\"Hello'
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ message: '" to me' })
      expect(result.result).toEqual({ message: 'He said "Hello" to me' })
    })
  })
})
