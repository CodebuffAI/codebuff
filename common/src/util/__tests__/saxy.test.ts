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
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'root',
            rawTag: '<root>',
          },
          type: 'tagopen',
        },
        {
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'child',
            rawTag: '<child>',
          },
          type: 'tagopen',
        },
        {
          data: {
            contents: 'content',
          },
          type: 'text',
        },
        {
          data: {
            name: 'child',
            rawTag: '</child>',
          },
          type: 'tagclose',
        },
        {
          data: {
            name: 'root',
            rawTag: '</root>',
          },
          type: 'tagclose',
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
        data: {
          contents: 'This is < not a tag> and < another not a tag> but ',
        },
        type: 'text',
      },
      {
        data: {
          attrs: '',
          isSelfClosing: false,
          name: 'valid',
          rawTag: '<valid>',
        },
        type: 'tagopen',
      },
      {
        data: {
          contents: 'this is',
        },
        type: 'text',
      },
      { data: { name: 'valid', rawTag: '</valid>' }, type: 'tagclose' },
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
        data: {
          contents: 'Text with < brackets> and ',
        },
        type: 'text',
      },
      {
        data: {
          attrs: '',
          isSelfClosing: false,
          name: 'valid-tag',
          rawTag: '<valid-tag>',
        },
        type: 'tagopen',
      },
      {
        data: {
          contents: 'real XML',
        },
        type: 'text',
      },
      {
        data: {
          name: 'valid-tag',
          rawTag: '</valid-tag>',
        },
        type: 'tagclose',
      },
      {
        data: {
          contents: ' mixed together',
        },
        type: 'text',
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

    it('should handle split XML entities in text content', () => {
      // Re-initialize parser and events array inside the test
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))

      parser.write('Text with &am')
      parser.write('p; and')
      parser.write(' &l')
      parser.write('t; entities &g')
      parser.end()

      expect(events).toEqual([
        {
          data: {
            contents: 'Text with ',
          },
          type: 'text',
        },
        {
          data: {
            contents: '& and',
          },
          type: 'text',
        },
        {
          data: {
            contents: ' ',
          },
          type: 'text',
        },
        {
          data: {
            contents: '< entities ',
          },
          type: 'text',
        },
        {
          data: {
            contents: '&g',
          },
          type: 'text',
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

      parser.write('<root> text <child>  text  </child> text </root>')
      parser.end()

      expect(events).toEqual([
        {
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'root',
            rawTag: '<root>',
          },
          type: 'tagopen',
        },
        {
          data: {
            contents: ' text ',
          },
          type: 'text',
        },
        {
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'child',
            rawTag: '<child>',
          },
          type: 'tagopen',
        },
        {
          data: {
            contents: '  text  ',
          },
          type: 'text',
        },
        {
          data: {
            name: 'child',
            rawTag: '</child>',
          },
          type: 'tagclose',
        },
        {
          data: {
            contents: ' text ',
          },
          type: 'text',
        },
        {
          data: {
            name: 'root',
            rawTag: '</root>',
          },
          type: 'tagclose',
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

    it('should handle split XML entities across chunks', async () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))
      parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
      parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

      // Write the XML in chunks that split the &amp; entity
      parser.write('<tag>before &a')
      parser.write('mp; after</tag>')
      parser.end()

      // The entity should be properly decoded and the text events should
      // reconstruct the original text correctly
      expect(events).toEqual([
        {
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'tag',
            rawTag: '<tag>',
          },
          type: 'tagopen',
        },
        {
          data: {
            contents: 'before ',
          },
          type: 'text',
        },
        {
          data: {
            contents: '& after',
          },
          type: 'text',
        },
        {
          data: {
            name: 'tag',
            rawTag: '</tag>',
          },
          type: 'tagclose',
        },
      ])

      // The text content should be properly reconstructed
      const textContent = events
        .filter((e) => e.type === 'text')
        .map((e) => e.data.contents)
        .join('')
      expect(textContent).toBe('before & after')
    })

    it('should handle multiple split entities in sequence', async () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))

      // Write chunks that split multiple entities
      parser.write('Text with &am')
      parser.write('p; and &l')
      parser.write('t; symbols')
      parser.end()

      // The entities should be properly decoded and combined
      expect(events.map((e) => e.data.contents).join('')).toBe(
        'Text with & and < symbols'
      )
    })

    it('should handle literal ampersand split across chunks', async () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => {
        events.push({ type: 'text', data })
      })
      parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
      parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

      // Write chunks that split a literal & character
      parser.write('<tag>before &')
      parser.write(' after</tag>')
      parser.end()

      // The & should be treated as literal text and stay with its surrounding content
      expect(events).toEqual([
        {
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'tag',
            rawTag: '<tag>',
          },
          type: 'tagopen',
        },
        {
          data: {
            contents: 'before ',
          },
          type: 'text',
        },
        {
          data: {
            contents: '& after',
          },
          type: 'text',
        },
        {
          data: {
            name: 'tag',
            rawTag: '</tag>',
          },
          type: 'tagclose',
        },
      ])

      // The text content should be properly reconstructed
      const textContent = events
        .filter((e) => e.type === 'text')
        .map((e) => e.data.contents)
        .join('')
      expect(textContent).toBe('before & after')
    })

    it('should not treat standalone ampersand as pending entity', async () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => {
        events.push({ type: 'text', data })
      })

      // Write chunks that split a standalone & character
      parser.write('Text with &')
      parser.write(' more text')
      parser.end()

      expect(events).toEqual([
        { type: 'text', data: { contents: 'Text with ' } },
        { type: 'text', data: { contents: '& more text' } },
      ])
      // The text content should be properly reconstructed
      const textContent = events
        .filter((e) => e.type === 'text')
        .map((e) => e.data.contents)
        .join('')
      expect(textContent).toBe('Text with & more text')
    })

    it('should handle text split across chunks without entities or tags', async () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))
      parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
      parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

      // Write text split across chunks with no entities or tags
      parser.write('<tag>Some text')
      parser.write(' continued</tag>')
      parser.end()

      // The text content should be emitted in two chunks due to the new immediate emission behavior
      expect(events).toEqual([
        {
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'tag',
            rawTag: '<tag>',
          },
          type: 'tagopen',
        },
        {
          data: {
            contents: 'Some text',
          },
          type: 'text',
        },
        {
          data: {
            contents: ' continued',
          },
          type: 'text',
        },
        {
          data: {
            name: 'tag',
            rawTag: '</tag>',
          },
          type: 'tagclose',
        },
      ])

      // The text content should still be properly reconstructible
      const textContent = events
        .filter((e) => e.type === 'text')
        .map((e) => e.data.contents)
        .join('')
      expect(textContent).toBe('Some text continued')
    })

    it('should output closing tag as text if not matching', async () => {
      const parser = new Saxy()
      const events: any[] = []
      parser.on('text', (data) => events.push({ type: 'text', data }))
      parser.on('tagopen', (data) => events.push({ type: 'tagopen', data }))
      parser.on('tagclose', (data) => events.push({ type: 'tagclose', data }))

      // Write text split across chunks with no entities or tags
      parser.write('<tag></invalid></tag>')
      parser.end()

      // The text content should be emitted in two chunks due to the new immediate emission behavior
      expect(events).toEqual([
        {
          data: {
            attrs: '',
            isSelfClosing: false,
            name: 'tag',
            rawTag: '<tag>',
          },
          type: 'tagopen',
        },
        {
          data: {
            name: 'invalid',
            rawTag: '</invalid>',
          },
          type: 'tagclose',
        },
        {
          data: {
            name: 'tag',
            rawTag: '</tag>',
          },
          type: 'tagclose',
        },
      ])

      // The text content should still be properly reconstructible
      const textContent = events
        .filter((e) => e.type === 'text')
        .map((e) => e.data.contents)
        .join('')
      expect(textContent).toBe('')
    })
  })
})
