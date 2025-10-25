import { endToolTag, startToolTag } from '@codebuff/common/tools/constants'
import { describe, expect, it } from 'bun:test'

import { filterXml } from '../tool-xml-filter'

function getStreamValues(stream: ReturnType<typeof filterXml>): {
  chunks: string[]
  finalBuffer: string
} {
  const chunks: string[] = []
  let finalBuffer = ''
  while (true) {
    const { value, done } = stream.next()
    if (done) {
      finalBuffer = value.buffer
      break
    }
    chunks.push(value.chunk)
  }
  return { chunks, finalBuffer }
}

describe('filterXml', () => {
  describe('basic text emission', () => {
    it('should emit text that does not contain tool tags', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: 'Hello, world!',
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['Hello, world!'])
      expect(finalBuffer).toBe('')
    })

    it('should emit multiple chunks of plain text', () => {
      const { chunks: chunks1, finalBuffer: buffer1 } = getStreamValues(
        filterXml({
          chunk: 'First chunk ',
          buffer: '',
        }),
      )

      const { chunks: chunks2, finalBuffer: buffer2 } = getStreamValues(
        filterXml({
          chunk: 'second chunk',
          buffer: buffer1,
        }),
      )

      expect([...chunks1, ...chunks2]).toEqual(['First chunk ', 'second chunk'])
      expect(buffer2).toBe('')
    })
  })

  describe('complete tool calls', () => {
    it('should filter out a complete tool call in a single chunk', () => {
      const toolCall = `${startToolTag}{"cb_tool_name": "test_tool"}${endToolTag}`

      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: toolCall,
          buffer: '',
        }),
      )

      expect(chunks).toEqual([])
      expect(finalBuffer).toBe('')
    })

    it('should emit text before and after a complete tool call', () => {
      const chunk = `Before text${startToolTag}{"cb_tool_name": "test"}${endToolTag}After text`

      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk,
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['Before text', 'After text'])
      expect(finalBuffer).toBe('')
    })

    it('should handle multiple tool calls in sequence', () => {
      const chunk = `Text1${startToolTag}{"tool": "a"}${endToolTag}Text2${startToolTag}{"tool": "b"}${endToolTag}Text3`

      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk,
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['Text1', 'Text2', 'Text3'])
      expect(finalBuffer).toBe('')
    })
  })

  describe('partial tool calls and buffering', () => {
    it('should buffer when chunk ends with incomplete start tag', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: 'Some text<codebuff_tool',
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['Some text'])
      expect(finalBuffer).toBe('<codebuff_tool')
    })

    it('should buffer when chunk ends with partial start tag', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: 'Text<code',
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['Text'])
      expect(finalBuffer).toBe('<code')
    })

    it('should buffer when receiving only start tag without end tag', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: `${startToolTag}{"tool": "test"`,
          buffer: '',
        }),
      )

      expect(chunks).toEqual([])
      expect(finalBuffer).toBe(`${startToolTag}{"tool": "test"`)
    })

    it('should complete buffered tool call when receiving end tag', () => {
      // First chunk: start tag and partial content
      const { chunks: chunks1, finalBuffer: buffer1 } = getStreamValues(
        filterXml({
          chunk: `${startToolTag}{"tool":`,
          buffer: '',
        }),
      )

      // Second chunk: rest of content and end tag
      const { chunks: chunks2, finalBuffer: buffer2 } = getStreamValues(
        filterXml({
          chunk: ` "test"}${endToolTag}`,
          buffer: buffer1,
        }),
      )

      expect([...chunks1, ...chunks2]).toEqual([])
      expect(buffer2).toBe('')
    })

    it('should handle text split across chunks with tool call', () => {
      const { chunks: chunks1, finalBuffer: buffer1 } = getStreamValues(
        filterXml({
          chunk: 'Before',
          buffer: '',
        }),
      )

      const { chunks: chunks2, finalBuffer: buffer2 } = getStreamValues(
        filterXml({
          chunk: ` text${startToolTag}{"tool": "test"}${endToolTag}After`,
          buffer: buffer1,
        }),
      )

      expect([...chunks1, ...chunks2]).toEqual(['Before', ' text', 'After'])
      expect(buffer2).toBe('')
    })
  })

  describe('overlap handling', () => {
    it('should handle overlap when chunk ends with start of tag', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: 'Text<',
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['Text'])
      expect(finalBuffer).toBe('<')
    })

    it('should handle overlap with multiple characters', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: 'Text<codebuff',
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['Text'])
      expect(finalBuffer).toBe('<codebuff')
    })

    it('should emit text when overlap resolves to non-tag', () => {
      // First chunk: ends with potential tag start
      const { chunks: chunks1, finalBuffer: buffer1 } = getStreamValues(
        filterXml({
          chunk: 'Text<code',
          buffer: '',
        }),
      )

      // Second chunk: doesn't continue the tag
      const { chunks: chunks2, finalBuffer: buffer2 } = getStreamValues(
        filterXml({
          chunk: 'word',
          buffer: buffer1,
        }),
      )

      expect([...chunks1, ...chunks2]).toEqual(['Text', '<codeword'])
      expect(buffer2).toBe('')
    })
  })

  describe('edge cases', () => {
    it('should handle empty chunks', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: '',
          buffer: '',
        }),
      )

      expect(chunks).toEqual([])
      expect(finalBuffer).toBe('')
    })

    it('should handle chunk with only start tag', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: startToolTag,
          buffer: '',
        }),
      )

      expect(chunks).toEqual([])
      expect(finalBuffer).toBe(startToolTag)
    })

    it('should handle chunk with only end tag', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: endToolTag,
          buffer: '',
        }),
      )

      expect(chunks).toEqual([endToolTag])
      expect(finalBuffer).toBe('')
    })

    it('should handle malformed tool call with end tag but no start tag', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: `Some text${endToolTag}More text`,
          buffer: '',
        }),
      )

      expect(chunks).toEqual([`Some text${endToolTag}`, 'More text'])
      expect(finalBuffer).toBe('')
    })

    it('should handle nested angle brackets in text', () => {
      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk: 'if (x < 5 && y > 3) { }',
          buffer: '',
        }),
      )

      expect(chunks).toEqual(['if (x < 5 && y > 3) { }'])
      expect(finalBuffer).toBe('')
    })

    it('should handle very long tool call content', () => {
      const longContent = 'x'.repeat(10000)
      const chunk = `${startToolTag}${longContent}${endToolTag}`

      const { chunks, finalBuffer } = getStreamValues(
        filterXml({
          chunk,
          buffer: '',
        }),
      )

      expect(chunks).toEqual([])
      expect(finalBuffer).toBe('')
    })
  })

  describe('complex streaming scenarios', () => {
    it('should handle tool call split across many small chunks', () => {
      let buffer = ''
      const allChunks: string[] = []
      const chunksList = [
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

      for (const chunk of chunksList) {
        const { chunks, finalBuffer } = getStreamValues(
          filterXml({ chunk, buffer }),
        )
        allChunks.push(...chunks)
        buffer = finalBuffer
      }

      expect(allChunks).toEqual([])
      expect(buffer).toBe('')
    })

    it('should handle interleaved text and tool calls across chunks', () => {
      let buffer = ''
      const allChunks: string[] = []
      const chunksList = [
        'Text1',
        `${startToolTag}{"a":1}`,
        `${endToolTag}Text2`,
        `${startToolTag}{"b":2}${endToolTag}`,
        'Text3',
      ]

      for (const chunk of chunksList) {
        const { chunks, finalBuffer } = getStreamValues(
          filterXml({ chunk, buffer }),
        )
        allChunks.push(...chunks)
        buffer = finalBuffer
      }

      expect(allChunks).toEqual(['Text1', 'Text2', 'Text3'])
      expect(buffer).toBe('')
    })

    it('should maintain buffer state correctly through multiple iterations', () => {
      const allChunks: string[] = []

      // Chunk 1: Text with partial tag
      const { chunks: chunks1, finalBuffer: buffer1 } = getStreamValues(
        filterXml({
          chunk: 'Start<code',
          buffer: '',
        }),
      )
      allChunks.push(...chunks1)
      expect(buffer1).toBe('<code')
      expect(allChunks).toEqual(['Start'])

      // Chunk 2: Complete the tag and add content
      const { chunks: chunks2, finalBuffer: buffer2 } = getStreamValues(
        filterXml({
          chunk: `buff_tool_call>\ncontent${endToolTag}`,
          buffer: buffer1,
        }),
      )
      allChunks.push(...chunks2)
      expect(buffer2).toBe('')
      expect(allChunks).toEqual(['Start'])

      // Chunk 3: More text
      const { chunks: chunks3, finalBuffer: buffer3 } = getStreamValues(
        filterXml({
          chunk: 'End',
          buffer: buffer2,
        }),
      )
      allChunks.push(...chunks3)
      expect(allChunks).toEqual(['Start', 'End'])
      expect(buffer3).toBe('')
    })
  })

  describe('real-world patterns', () => {
    it('should handle typical LLM streaming with tool call', () => {
      let buffer = ''
      const allChunks: string[] = []
      const chunksList = [
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

      for (const chunk of chunksList) {
        const { chunks, finalBuffer } = getStreamValues(
          filterXml({ chunk, buffer }),
        )
        allChunks.push(...chunks)
        buffer = finalBuffer
      }

      expect(allChunks).toEqual([
        'Let me help you with that.\n\n',
        '\n',
        "I've created the file for you.",
      ])
      expect(buffer).toBe('')
    })

    it('should handle multiple tool calls with explanatory text', () => {
      let buffer = ''
      const allChunks: string[] = []
      const chunksList = [
        "First, I'll read the file.\n",
        `${startToolTag}{"cb_tool_name":"read_files","paths":["file.ts"]}${endToolTag}\n`,
        "Now I'll update it.\n",
        `${startToolTag}{"cb_tool_name":"write_file","path":"file.ts","content":"new"}${endToolTag}\n`,
        'Done!',
      ]

      for (const chunk of chunksList) {
        const { chunks, finalBuffer } = getStreamValues(
          filterXml({ chunk, buffer }),
        )
        allChunks.push(...chunks)
        buffer = finalBuffer
      }

      expect(allChunks).toEqual([
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
