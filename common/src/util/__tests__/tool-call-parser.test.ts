import { describe, it, expect } from 'bun:test'

import { parseToolCallXml } from '../xml'

describe('parseToolCallXml', () => {
  describe('basic parsing', () => {
    it('parses simple flat XML with single tag', () => {
      const xml = '<name>John</name>'
      expect(parseToolCallXml(xml)).toEqual({ name: 'John' })
    })

    it('parses multiple flat tags', () => {
      const xml = '<name>John</name><age>30</age><city>NYC</city>'
      expect(parseToolCallXml(xml)).toEqual({
        name: 'John',
        age: '30',
        city: 'NYC',
      })
    })

    it('parses tags with newlines between them', () => {
      const xml = `<name>John</name>
<age>30</age>
<city>NYC</city>`
      expect(parseToolCallXml(xml)).toEqual({
        name: 'John',
        age: '30',
        city: 'NYC',
      })
    })

    it('parses tags with extra whitespace around XML', () => {
      const xml = '  <name>John</name>  <age>30</age>  '
      expect(parseToolCallXml(xml)).toEqual({
        name: 'John',
        age: '30',
      })
    })
  })

  describe('whitespace handling', () => {
    it('trims leading whitespace from values', () => {
      const xml = '<content>  hello</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'hello' })
    })

    it('trims trailing whitespace from values', () => {
      const xml = '<content>hello  </content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'hello' })
    })

    it('trims leading and trailing whitespace from values', () => {
      const xml = '<content>  hello  </content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'hello' })
    })

    it('preserves internal whitespace in values', () => {
      const xml = '<content>hello   world</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'hello   world' })
    })

    it('preserves newlines within values', () => {
      const xml = '<content>line1\nline2\nline3</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'line1\nline2\nline3' })
    })

    it('preserves tabs within values', () => {
      const xml = '<content>col1\tcol2\tcol3</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'col1\tcol2\tcol3' })
    })

    it('handles multiline values with indentation', () => {
      const xml = `<content>
  function foo() {
    return 42;
  }
</content>`
      expect(parseToolCallXml(xml)).toEqual({
        content: `function foo() {
    return 42;
  }`,
      })
    })
  })

  describe('empty and edge cases', () => {
    it('returns empty object for empty string', () => {
      expect(parseToolCallXml('')).toEqual({})
    })

    it('returns empty object for whitespace-only string', () => {
      expect(parseToolCallXml('   ')).toEqual({})
      expect(parseToolCallXml('\n\t\r')).toEqual({})
    })

    it('handles empty tag values', () => {
      const xml = '<content></content>'
      expect(parseToolCallXml(xml)).toEqual({ content: '' })
    })

    it('handles self-referencing tag names', () => {
      const xml = '<foo>bar</foo>'
      expect(parseToolCallXml(xml)).toEqual({ foo: 'bar' })
    })

    it('returns empty object for invalid XML without matching tags', () => {
      const xml = '<name>John'
      expect(parseToolCallXml(xml)).toEqual({})
    })

    it('returns empty object for mismatched tags', () => {
      const xml = '<name>John</age>'
      expect(parseToolCallXml(xml)).toEqual({})
    })
  })

  describe('special characters in values', () => {
    it('handles angle brackets in values (escaped)', () => {
      const xml = '<content>&lt;div&gt;</content>'
      // Note: parseToolCallXml does NOT decode entities
      expect(parseToolCallXml(xml)).toEqual({ content: '&lt;div&gt;' })
    })

    it('handles ampersands in values (escaped)', () => {
      const xml = '<content>foo &amp; bar</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'foo &amp; bar' })
    })

    it('handles quotes in values', () => {
      const xml = '<content>He said "hello"</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'He said "hello"' })
    })

    it('handles single quotes in values', () => {
      const xml = "<content>It's fine</content>"
      expect(parseToolCallXml(xml)).toEqual({ content: "It's fine" })
    })

    it('handles special regex characters in values', () => {
      const xml = '<content>test.*pattern?[a-z]+</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'test.*pattern?[a-z]+' })
    })

    it('handles unicode characters in values', () => {
      const xml = '<content>Hello 世界 🌍</content>'
      expect(parseToolCallXml(xml)).toEqual({ content: 'Hello 世界 🌍' })
    })
  })

  describe('real-world tool call examples', () => {
    it('parses read_files tool call', () => {
      const xml = `<paths>["src/index.ts", "src/utils.ts"]</paths>`
      expect(parseToolCallXml(xml)).toEqual({
        paths: '["src/index.ts", "src/utils.ts"]',
      })
    })

    it('parses write_file tool call', () => {
      const xml = `<path>src/hello.ts</path>
<content>export function hello() {
  return "Hello, World!";
}</content>`
      expect(parseToolCallXml(xml)).toEqual({
        path: 'src/hello.ts',
        content: `export function hello() {
  return "Hello, World!";
}`,
      })
    })

    it('parses str_replace tool call', () => {
      const xml = `<path>src/file.ts</path>
<old>const x = 1</old>
<new>const x = 2</new>`
      expect(parseToolCallXml(xml)).toEqual({
        path: 'src/file.ts',
        old: 'const x = 1',
        new: 'const x = 2',
      })
    })

    it('parses command tool call', () => {
      const xml = `<command>npm test</command>
<timeout_seconds>60</timeout_seconds>`
      expect(parseToolCallXml(xml)).toEqual({
        command: 'npm test',
        timeout_seconds: '60',
      })
    })
  })

  describe('tag name handling', () => {
    it('handles underscore in tag names', () => {
      const xml = '<tool_name>read_files</tool_name>'
      expect(parseToolCallXml(xml)).toEqual({ tool_name: 'read_files' })
    })

    it('handles numbers in tag names', () => {
      const xml = '<param1>value1</param1><param2>value2</param2>'
      expect(parseToolCallXml(xml)).toEqual({
        param1: 'value1',
        param2: 'value2',
      })
    })

    it('handles camelCase tag names', () => {
      const xml = '<toolName>readFiles</toolName>'
      expect(parseToolCallXml(xml)).toEqual({ toolName: 'readFiles' })
    })
  })

  describe('duplicate and nested tags', () => {
    it('uses last value when same tag appears multiple times', () => {
      const xml = '<name>John</name><name>Jane</name>'
      // The regex pattern uses non-greedy matching, so both are parsed
      // and the second overwrites the first
      const result = parseToolCallXml(xml)
      expect(result.name).toBe('Jane')
    })

    it('handles content with child-like text (but not actual nested tags)', () => {
      // parseToolCallXml does simple flat XML parsing and doesn't handle
      // properly nested same-name tags - it's documented as such
      const xml = '<content>text with &lt;child&gt;fake&lt;/child&gt; tags</content>'
      expect(parseToolCallXml(xml)).toEqual({
        content: 'text with &lt;child&gt;fake&lt;/child&gt; tags',
      })
    })
  })
})
