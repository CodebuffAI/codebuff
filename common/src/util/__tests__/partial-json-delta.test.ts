import { describe, expect, it } from 'bun:test'

import {
  getPartialJsonDelta,
  parsePartialJsonObject,
} from '../partial-json-delta'

describe('parsePartialJsonObject', () => {
  describe('valid JSON', () => {
    it('should parse complete valid JSON', () => {
      const input = '{"name": "test", "value": 42}'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ name: 'test', value: 42 })
    })

    it('should parse empty object', () => {
      const input = '{}'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({})
    })

    it('should parse nested objects', () => {
      const input = '{"user": {"name": "John", "age": 30}}'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ user: { name: 'John', age: 30 } })
    })

    it('should parse arrays', () => {
      const input = '{"items": [1, 2, 3]}'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ items: [1, 2, 3] })
    })
  })

  describe('incomplete JSON - missing closing brace', () => {
    it('should parse object missing final closing brace', () => {
      const input = '{"name": "test", "value": 42'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ name: 'test', value: 42 })
    })

    it('should parse nested object missing final closing brace', () => {
      const input = '{"user": {"name": "John", "age": 30}'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ user: { name: 'John', age: 30 } })
    })

    it('should parse object with incomplete string value', () => {
      const input = '{"name": "test", "incomplete": "partial'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ name: 'test', incomplete: 'partial' })
    })
  })

  describe('incomplete JSON - trailing comma handling', () => {
    it('should handle trailing comma by removing last property', () => {
      const input = '{"name": "test", "value": 42, "incomplete":'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ name: 'test', value: 42 })
    })

    it('should handle multiple trailing commas', () => {
      const input = '{"a": 1, "b": 2, "c": 3, "d":'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('should handle nested object with trailing comma', () => {
      const input = '{"user": {"name": "John", "age": 30}, "incomplete":'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ user: { name: 'John', age: 30 } })
    })

    it('should handle array with trailing comma', () => {
      const input = '{"items": [1, 2, 3], "incomplete":'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ items: [1, 2, 3] })
    })
  })

  describe('edge cases', () => {
    it('should return empty object for empty string', () => {
      const input = ''
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({})
    })

    it('should return empty object for invalid JSON', () => {
      const input = 'not json at all'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({})
    })

    it('should return empty object for malformed JSON', () => {
      const input = '{"name": test}'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({})
    })

    it('should handle JSON with only opening brace', () => {
      const input = '{'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({})
    })

    it('should handle JSON with whitespace', () => {
      const input = '  {"name": "test"}  '
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ name: 'test' })
    })

    it('should handle complex nested incomplete JSON', () => {
      const input =
        '{"data": {"users": [{"name": "John"}, {"name": "Jane"}], "count": 2}, "meta":'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({
        data: {
          users: [{ name: 'John' }, { name: 'Jane' }],
          count: 2,
        },
      })
    })
  })

  describe('real-world streaming scenarios', () => {
    it('should handle partial JSON from streaming response', () => {
      const input =
        '{"status": "processing", "progress": 0.5, "message": "Working on'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({
        status: 'processing',
        progress: 0.5,
        message: 'Working on',
      })
    })

    it('should handle JSON with boolean and null values', () => {
      const input =
        '{"active": true, "deleted": false, "metadata": null, "incomplete":'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ active: true, deleted: false, metadata: null })
    })

    it('should handle JSON with numbers', () => {
      const input =
        '{"integer": 42, "float": 3.14, "negative": -10, "incomplete":'
      const result = parsePartialJsonObject(input)
      expect(result).toEqual({ integer: 42, float: 3.14, negative: -10 })
    })
  })
})

describe('getPartialJsonDelta', () => {
  describe('basic delta detection', () => {
    it('should detect new properties', () => {
      const content = '{"name": "test", "value": 42}'
      const previous = {}
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ name: 'test', value: 42 })
      expect(result.result).toEqual({ name: 'test', value: 42 })
    })

    it('should detect changed properties', () => {
      const content = '{"value":100,"name":"updated"}'
      const previous = { value: 100, name: 'upda' }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ name: 'ted' })
      expect(result.result).toEqual({ value: 100, name: 'updated' })
    })

    it('should return empty delta for unchanged properties', () => {
      const content = '{"name": "test", "value": 42}'
      const previous = { name: 'test', value: 42 }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({})
      expect(result.result).toEqual({ name: 'test', value: 42 })
    })

    it('should detect partial changes', () => {
      const content = '{"name": "test", "value": 100}'
      const previous = { name: 'test', value: 42 }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ value: 100 })
      expect(result.result).toEqual({ name: 'test', value: 100 })
    })
  })

  describe('string delta handling', () => {
    it('should handle string changes', () => {
      const content = '{"message": "Hello World"}'
      const previous = { message: 'Hello' }
      const result = getPartialJsonDelta(content, previous)

      // Note: Current implementation has a bug - it doesn't return the sliced string
      // This test documents the current behavior
      expect(result.delta).toEqual({ message: ' World' })
      expect(result.result).toEqual({ message: 'Hello World' })
    })

    it('should handle empty string to non-empty string', () => {
      const content = '{"message": "Hello"}'
      const previous = { message: '' }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ message: 'Hello' })
      expect(result.result).toEqual({ message: 'Hello' })
    })

    it('should handle undefined to string', () => {
      const content = '{"message": "Hello"}'
      const previous = {}
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ message: 'Hello' })
      expect(result.result).toEqual({ message: 'Hello' })
    })
  })

  describe('complex object changes', () => {
    it('should handle nested object changes', () => {
      const content = '{"user": {"name": "John", "age": 31}}'
      const previous = { user: { name: 'John', age: 30 } }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ user: { name: 'John', age: 31 } })
      expect(result.result).toEqual({ user: { name: 'John', age: 31 } })
    })

    it('should handle array changes', () => {
      const content = '{"items": [1, 2, 3, 4]}'
      const previous = { items: [1, 2, 3] }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ items: [1, 2, 3, 4] })
      expect(result.result).toEqual({ items: [1, 2, 3, 4] })
    })

    it('should handle mixed type changes', () => {
      const content = '{"value": "string"}'
      const previous = { value: 42 }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ value: 'string' })
      expect(result.result).toEqual({ value: 'string' })
    })
  })

  describe('streaming scenarios', () => {
    it('should handle progressive JSON building', () => {
      let previous = {}

      // First chunk
      let content = '{"status": "processing"'
      let result = getPartialJsonDelta(content, previous)
      expect(result.delta).toEqual({ status: 'processing' })
      previous = result.result

      // Second chunk
      content += ', "progress": 1.0'
      result = getPartialJsonDelta(content, previous)
      expect(result.delta).toEqual({ progress: 1.0 })
      previous = result.result

      // Final chunk
      content += ', "result": "success"}'
      result = getPartialJsonDelta(content, previous)
      expect(result.delta).toEqual({
        result: 'success',
      })
    })

    it('should handle incomplete JSON in streaming', () => {
      const content =
        '{"message": "This is a long message that is being streamed'
      const previous = { message: 'This is a long' }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({
        message: ' message that is being streamed',
      })
      expect(result.result).toEqual({
        message: 'This is a long message that is being streamed',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const content = ''
      const previous = { name: 'test' }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({})
      expect(result.result).toEqual({})
    })

    it('should handle invalid JSON content', () => {
      const content = 'not json'
      const previous = { name: 'test' }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({})
      expect(result.result).toEqual({})
    })

    it('should handle null and undefined values', () => {
      const content = '{"value": null}'
      const previous = { value: undefined }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ value: null })
      expect(result.result).toEqual({ value: null })
    })

    it('should handle boolean changes', () => {
      const content = '{"active": false}'
      const previous = { active: true }
      const result = getPartialJsonDelta(content, previous)

      expect(result.delta).toEqual({ active: false })
      expect(result.result).toEqual({ active: false })
    })
  })
})
