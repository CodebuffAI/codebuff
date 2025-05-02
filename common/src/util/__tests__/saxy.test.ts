import { describe, expect, it } from 'bun:test'

import { Saxy } from '../saxy'

describe('Saxy XML Parser', () => {
  // Helper function to process XML and get events
  const processXML = (xml: string, schema?: Record<string, string[]>) => {
    const events: Array<{ type: string; data: any }> = []
    const parser = new Saxy(schema)

    parser.on('text', (data) => events.push({ type: 'text', data }))
    parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
    parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

    parser.write(xml)
    parser.end()

    return events
  }

  describe('Schema Validation with Text Conversion', () => {
    it('should convert invalid top-level tags to text nodes', () => {
      const schema = { root: ['child'] }
      const xml = '<invalid>content</invalid>'
      const events = processXML(xml, schema)

      expect(events).toEqual([
        {
          type: 'text',
          data: { contents: '<invalid>' },
        },
        {
          type: 'text',
          data: { contents: 'content' },
        },
        {
          type: 'text',
          data: { contents: '</invalid>' },
        },
      ])
    })

    it('should convert invalid nested tags to text nodes', () => {
      const schema = { root: ['child'] }
      const xml = '<other><invalid>content</invalid></other>'
      const events = processXML(xml, schema)

      expect(events).toEqual([
        {
          type: 'text',
          data: { contents: '<other>' },
        },
        {
          type: 'text',
          data: { contents: '<invalid>' },
        },
        {
          type: 'text',
          data: { contents: 'content' },
        },
        {
          type: 'text',
          data: { contents: '</invalid>' },
        },
        {
          type: 'text',
          data: { contents: '</other>' },
        },
      ])
    })

    it('should handle valid nested tags according to schema', () => {
      const schema = { root: ['child'] }
      const xml = '<root><child>content</child></root>'
      const events = processXML(xml, schema)

      expect(events).toEqual([
        {
          type: 'tagopen',
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'root',
          },
        },
        {
          type: 'tagopen',
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'child',
          },
        },
        {
          type: 'text',
          data: { contents: 'content' },
        },
        {
          type: 'tagclose',
          data: { name: 'child' },
        },
        {
          type: 'tagclose',
          data: { name: 'root' },
        },
      ])
    })

    it('should convert closing tags to text when parent is invalid', () => {
      const schema = { root: ['child'] }
      const xml = '<root><invalid>content</invalid><child/></root>'
      const events = processXML(xml, schema)

      expect(events[1]).toEqual({
        type: 'text',
        data: { contents: '<invalid>' },
      })
      expect(events[2]).toEqual({
        type: 'text',
        data: { contents: 'content' },
      })
      expect(events[3]).toEqual({
        type: 'text',
        data: { contents: '</invalid>' },
      })
    })

    it('should handle tags starting with whitespace as text', () => {
      const schema = { root: ['child'] }
      const xml = '<root>< invalid>content</invalid></root>'
      const events = processXML(xml, schema)

      expect(events[1]).toEqual({
        type: 'text',
        data: { contents: '< invalid>content' },
      })
      expect(events[2]).toEqual({
        type: 'text',
        data: { contents: '</invalid>' },
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle self-closing invalid tags', () => {
      const schema = { root: ['child'] }
      const xml = '<root><invalid/></root>'
      const events = processXML(xml, schema)

      expect(events[1]).toEqual({
        type: 'text',
        data: { contents: '<invalid/>' },
      })
    })

    it('should handle nested invalid tags', () => {
      const schema = { root: ['child'] }
      const xml = '<root><invalid><alsoinvalid/></invalid></root>'
      const events = processXML(xml, schema)

      expect(events[1]).toEqual({
        type: 'text',
        data: { contents: '<invalid>' },
      })
      expect(events[2]).toEqual({
        type: 'text',
        data: { contents: '<alsoinvalid/>' },
      })
      expect(events[3]).toEqual({
        type: 'text',
        data: { contents: '</invalid>' },
      })
    })

    it('should preserve attributes in converted text nodes', () => {
      const schema = { root: ['child'] }
      const xml = '<root><invalid attr="value">content</invalid></root>'
      const events = processXML(xml, schema)

      expect(events[1]).toEqual({
        type: 'text',
        data: { contents: '<invalid attr="value">' },
      })
      expect(events[2]).toEqual({
        type: 'text',
        data: { contents: 'content' },
      })
      expect(events[3]).toEqual({
        type: 'text',
        data: { contents: '</invalid>' },
      })
    })
  })

  it('should handle text that looks like invalid XML tags', () => {
    const parser = new Saxy()
    const events: any[] = []
    parser.on('text', (data) => events.push({ type: 'text', data }))
    parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
    parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

    parser.write(
      'This is < not a tag> and < another not a tag> but <valid>this is</valid>'
    )
    parser.end()

    expect(events).toEqual([
      {
        type: 'text',
        data: {
          contents: 'This is < not a tag> and < another not a tag> but ',
        },
      },
      {
        type: 'tagopen',
        data: { name: 'valid', isSelfClosing: false, attrs: '' },
      },
      {
        type: 'text',
        data: { contents: 'this is' },
      },
      {
        type: 'tagclose',
        data: { name: 'valid' },
      },
    ])
  })

  it('should handle text with angle brackets but no valid tag names', () => {
    const parser = new Saxy()
    const events: any[] = []
    parser.on('text', (data) => events.push({ type: 'text', data }))

    parser.write('Math expressions: 2 < 3 and 5 > 4')
    parser.end()

    expect(events).toEqual([
      {
        type: 'text',
        data: { contents: 'Math expressions: 2 < 3 and 5 > 4' },
      },
    ])
  })

  it('should correctly parse mixed valid and invalid XML-like content', () => {
    const parser = new Saxy()
    const events: any[] = []
    parser.on('text', (data) => events.push({ type: 'text', data }))
    parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
    parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

    parser.write(
      'Text with < brackets> and <valid-tag>real XML</valid-tag> mixed together'
    )
    parser.end()

    expect(events).toEqual([
      {
        type: 'text',
        data: { contents: 'Text with < brackets> and ' },
      },
      {
        type: 'tagopen',
        data: { name: 'valid-tag', isSelfClosing: false, attrs: '' },
      },
      {
        type: 'text',
        data: { contents: 'real XML' },
      },
      {
        type: 'tagclose',
        data: { name: 'valid-tag' },
      },
      {
        type: 'text',
        data: { contents: ' mixed together' },
      },
    ])
  })

  it('should handle edge cases with special characters after <', () => {
    const parser = new Saxy()
    const events: any[] = []
    parser.on('text', (data) => events.push({ type: 'text', data }))

    parser.write('Text with <1>, <@invalid>, and <!not-a-tag>')
    parser.end()

    expect(events).toEqual([
      {
        type: 'text',
        data: { contents: 'Text with <1>, <@invalid>, and <!not-a-tag>' },
      },
    ])
  })

  describe('Text Node Handling', () => {
    it('should preserve whitespace in text nodes', () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))

      parser.write('  Text with leading and trailing spaces  ')
      parser.end()

      expect(events).toEqual([
        {
          type: 'text',
          data: { contents: '  Text with leading and trailing spaces  ' },
        },
      ])
    })

    it('should handle HTML entities in text content', () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))

      parser.write('Text with &amp; and &lt; entities')
      parser.end()

      expect(events).toEqual([
        {
          type: 'text',
          data: { contents: 'Text with & and < entities' },
        },
      ])
    })

    it('should handle split HTML entities in text content', () => {
      // Re-initialize parser and events array inside the test
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => {
        console.log('Test listener received text:', JSON.stringify(data))
        events.push({ type: 'text', data })
      })

      parser.write('Text with &am')
      parser.write('p; and &l')
      parser.write('t; entities &g')
      parser.end()

      expect(events).toEqual([
        {
          type: 'text',
          data: { contents: 'Text with ' },
        },
        {
          type: 'text',
          data: { contents: '& and ' },
        },
        {
          type: 'text',
          data: { contents: '< entities ' },
        },
        {
          type: 'text',
          data: { contents: '&g' },
        },
      ])
      expect(events.map((chunk) => chunk.data.contents).join('')).toEqual(
        'Text with & and < entities &g'
      )
    })

    it('should preserve whitespace between tags', () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))
      parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
      parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

      parser.write('<root>  <child>  text  </child>  </root>')
      parser.end()

      expect(events).toEqual([
        {
          type: 'tagopen',
          data: { name: 'root', isSelfClosing: false, attrs: '' },
        },
        {
          type: 'text',
          data: { contents: '  ' },
        },
        {
          type: 'tagopen',
          data: { name: 'child', isSelfClosing: false, attrs: '' },
        },
        {
          type: 'text',
          data: { contents: '  text  ' },
        },
        {
          type: 'tagclose',
          data: { name: 'child' },
        },
        {
          type: 'text',
          data: { contents: '  ' },
        },
        {
          type: 'tagclose',
          data: { name: 'root' },
        },
      ])
    })

    it('should handle multiple HTML entities in the same text node', () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))

      parser.write('Text with &amp; &lt; &gt; &quot; entities')
      parser.end()

      expect(events).toEqual([
        {
          type: 'text',
          data: { contents: 'Text with & < > " entities' },
        },
      ])
    })

    it('should preserve newlines in text content', () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))

      parser.write('Line 1\nLine 2\r\nLine 3')
      parser.end()

      expect(events).toEqual([
        {
          type: 'text',
          data: { contents: 'Line 1\nLine 2\r\nLine 3' },
        },
      ])
    })
  })
})
