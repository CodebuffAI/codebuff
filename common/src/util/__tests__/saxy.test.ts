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
          data: { contents: '<root>' },
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
          data: { contents: '</root>' },
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
        data: { contents: '< invalid>' },
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
})
