import { endToolTag, startToolTag } from '@codebuff/common/tools/constants'
import { describe, expect, it, beforeEach } from 'bun:test'

import { filterXml } from '../tool-xml-filter'

describe('filterXml', () => {
  let emittedChunks: string[]
  let omit: (chunk: string) => void

  beforeEach(() => {
    emittedChunks = []
    omit = (chunk: string) => {
      emittedChunks.push(chunk)
    }
  })

  describe('basic text emission', () => {
    it('should emit text that does not contain tool tags', async () => {
      const result = await filterXml({
        chunk: 'Hello, world!',
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['Hello, world!'])
      expect(result.buffer).toBe('')
    })

    it('should emit multiple chunks of plain text', async () => {
      let buffer = ''

      const result1 = await filterXml({
        chunk: 'First chunk ',
        omit,
        buffer,
      })
      buffer = result1.buffer

      const result2 = await filterXml({
        chunk: 'second chunk',
        omit,
        buffer,
      })

      expect(emittedChunks).toEqual(['First chunk ', 'second chunk'])
      expect(result2.buffer).toBe('')
    })
  })

  describe('complete tool calls', () => {
    it('should filter out a complete tool call in a single chunk', async () => {
      const toolCall = `${startToolTag}{"cb_tool_name": "test_tool"}${endToolTag}`

      const result = await filterXml({
        chunk: toolCall,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual([])
      expect(result.buffer).toBe('')
    })

    it('should emit text before and after a complete tool call', async () => {
      const chunk = `Before text${startToolTag}{"cb_tool_name": "test"}${endToolTag}After text`

      const result = await filterXml({
        chunk,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['Before text', 'After text'])
      expect(result.buffer).toBe('')
    })

    it('should handle multiple tool calls in sequence', async () => {
      const chunk = `Text1${startToolTag}{"tool": "a"}${endToolTag}Text2${startToolTag}{"tool": "b"}${endToolTag}Text3`

      const result = await filterXml({
        chunk,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['Text1', 'Text2', 'Text3'])
      expect(result.buffer).toBe('')
    })
  })

  describe('partial tool calls and buffering', () => {
    it('should buffer when chunk ends with incomplete start tag', async () => {
      const result = await filterXml({
        chunk: 'Some text<codebuff_tool',
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['Some text'])
      expect(result.buffer).toBe('<codebuff_tool')
    })

    it('should buffer when chunk ends with partial start tag', async () => {
      const result = await filterXml({
        chunk: 'Text<code',
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['Text'])
      expect(result.buffer).toBe('<code')
    })

    it('should buffer when receiving only start tag without end tag', async () => {
      const result = await filterXml({
        chunk: `${startToolTag}{"tool": "test"`,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual([])
      expect(result.buffer).toBe(`${startToolTag}{"tool": "test"`)
    })

    it('should complete buffered tool call when receiving end tag', async () => {
      let buffer = ''

      // First chunk: start tag and partial content
      const result1 = await filterXml({
        chunk: `${startToolTag}{"tool":`,
        omit,
        buffer,
      })
      buffer = result1.buffer

      // Second chunk: rest of content and end tag
      const result2 = await filterXml({
        chunk: ` "test"}${endToolTag}`,
        omit,
        buffer,
      })

      expect(emittedChunks).toEqual([])
      expect(result2.buffer).toBe('')
    })

    it('should handle text split across chunks with tool call', async () => {
      let buffer = ''

      const result1 = await filterXml({
        chunk: 'Before',
        omit,
        buffer,
      })
      buffer = result1.buffer

      const result2 = await filterXml({
        chunk: ` text${startToolTag}{"tool": "test"}${endToolTag}After`,
        omit,
        buffer,
      })

      expect(emittedChunks).toEqual(['Before', ' text', 'After'])
      expect(result2.buffer).toBe('')
    })
  })

  describe('overlap handling', () => {
    it('should handle overlap when chunk ends with start of tag', async () => {
      const result = await filterXml({
        chunk: 'Text<',
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['Text'])
      expect(result.buffer).toBe('<')
    })

    it('should handle overlap with multiple characters', async () => {
      const result = await filterXml({
        chunk: 'Text<codebuff',
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['Text'])
      expect(result.buffer).toBe('<codebuff')
    })

    it('should emit text when overlap resolves to non-tag', async () => {
      let buffer = ''

      // First chunk: ends with potential tag start
      const result1 = await filterXml({
        chunk: 'Text<code',
        omit,
        buffer,
      })
      buffer = result1.buffer

      // Second chunk: doesn't continue the tag
      const result2 = await filterXml({
        chunk: 'word',
        omit,
        buffer,
      })

      expect(emittedChunks).toEqual(['Text', '<codeword'])
      expect(result2.buffer).toBe('')
    })
  })

  describe('edge cases', () => {
    it('should handle empty chunks', async () => {
      const result = await filterXml({
        chunk: '',
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual([])
      expect(result.buffer).toBe('')
    })

    it('should handle chunk with only start tag', async () => {
      const result = await filterXml({
        chunk: startToolTag,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual([])
      expect(result.buffer).toBe(startToolTag)
    })

    it('should handle chunk with only end tag', async () => {
      const result = await filterXml({
        chunk: endToolTag,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual([endToolTag])
      expect(result.buffer).toBe('')
    })

    it('should handle malformed tool call with end tag but no start tag', async () => {
      const result = await filterXml({
        chunk: `Some text${endToolTag}More text`,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual([`Some text${endToolTag}`, 'More text'])
      expect(result.buffer).toBe('')
    })

    it('should handle nested angle brackets in text', async () => {
      const result = await filterXml({
        chunk: 'if (x < 5 && y > 3) { }',
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual(['if (x < 5 && y > 3) { }'])
      expect(result.buffer).toBe('')
    })

    it('should handle very long tool call content', async () => {
      const longContent = 'x'.repeat(10000)
      const chunk = `${startToolTag}${longContent}${endToolTag}`

      const result = await filterXml({
        chunk,
        omit,
        buffer: '',
      })

      expect(emittedChunks).toEqual([])
      expect(result.buffer).toBe('')
    })
  })

  describe('complex streaming scenarios', () => {
    it('should handle tool call split across many small chunks', async () => {
      let buffer = ''
      const chunks = [
        '<',
        'codebuff',
        '_tool',
        '_call',
        '>\n',
        '{"tool',
        '": "test',
        '"}',
        '\n</',
        'codebuff',
        '_tool_call',
        '>',
      ]

      for (const chunk of chunks) {
        const result = await filterXml({ chunk, omit, buffer })
        buffer = result.buffer
      }

      expect(emittedChunks).toEqual([])
      expect(buffer).toBe('')
    })

    it('should handle interleaved text and tool calls across chunks', async () => {
      let buffer = ''
      const chunks = [
        'Text1',
        `${startToolTag}{"a":1}`,
        `${endToolTag}Text2`,
        `${startToolTag}{"b":2}${endToolTag}`,
        'Text3',
      ]

      for (const chunk of chunks) {
        const result = await filterXml({ chunk, omit, buffer })
        buffer = result.buffer
      }

      expect(emittedChunks).toEqual(['Text1', 'Text2', 'Text3'])
      expect(buffer).toBe('')
    })

    it('should maintain buffer state correctly through multiple iterations', async () => {
      let buffer = ''

      // Chunk 1: Text with partial tag
      const result1 = await filterXml({
        chunk: 'Start<code',
        omit,
        buffer,
      })
      buffer = result1.buffer
      expect(buffer).toBe('<code')
      expect(emittedChunks).toEqual(['Start'])

      // Chunk 2: Complete the tag and add content
      const result2 = await filterXml({
        chunk: `buff_tool_call>\ncontent${endToolTag}`,
        omit,
        buffer,
      })
      buffer = result2.buffer
      expect(buffer).toBe('')
      expect(emittedChunks).toEqual(['Start'])

      // Chunk 3: More text
      const result3 = await filterXml({
        chunk: 'End',
        omit,
        buffer,
      })
      expect(emittedChunks).toEqual(['Start', 'End'])
      expect(result3.buffer).toBe('')
    })
  })

  describe('real-world patterns', () => {
    it('should handle typical LLM streaming with tool call', async () => {
      let buffer = ''
      const chunks = [
        'Let me help you with that.\n\n',
        `${startToolTag}\n`,
        '{\n',
        '  "cb_tool_name": "write_file",\n',
        '  "path": "test.ts",\n',
        '  "content": "console.log(\'hello\');"\n',
        '}\n',
        `${endToolTag}\n`,
        "I've created the file for you.",
      ]

      for (const chunk of chunks) {
        const result = await filterXml({ chunk, omit, buffer })
        buffer = result.buffer
      }

      expect(emittedChunks).toEqual([
        'Let me help you with that.\n\n',
        '\n',
        "I've created the file for you.",
      ])
      expect(buffer).toBe('')
    })

    it('should handle multiple tool calls with explanatory text', async () => {
      let buffer = ''
      const chunks = [
        "First, I'll read the file.\n",
        `${startToolTag}{"cb_tool_name":"read_files","paths":["file.ts"]}${endToolTag}\n`,
        "Now I'll update it.\n",
        `${startToolTag}{"cb_tool_name":"write_file","path":"file.ts","content":"new"}${endToolTag}\n`,
        'Done!',
      ]

      for (const chunk of chunks) {
        const result = await filterXml({ chunk, omit, buffer })
        buffer = result.buffer
      }

      expect(emittedChunks).toEqual([
        "First, I'll read the file.\n",
        '\n',
        "Now I'll update it.\n",
        '\n',
        'Done!',
      ])
      expect(buffer).toBe('')
    })
  })
})
