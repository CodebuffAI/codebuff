import { describe, expect, it } from 'bun:test'

import {
  createStreamParserState,
  parseStreamChunk,
} from '../stream-xml-parser'

describe('stream-xml-parser', () => {
  describe('parseStreamChunk', () => {
    it('should pass through plain text without tool calls', () => {
      const state = createStreamParserState()
      const result = parseStreamChunk('Hello, world!', state)

      expect(result.filteredText).toBe('Hello, world!')
      expect(result.toolCalls).toEqual([])
    })

    it('should extract a complete tool call in a single chunk', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>
{"cb_tool_name": "test_tool", "path": "foo.ts"}
</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('test_tool')
      expect(result.toolCalls[0].input).toEqual({ path: 'foo.ts' })
    })

    it('should extract tool call and preserve text before and after', () => {
      const state = createStreamParserState()
      const chunk = `Before text
<codebuff_tool_call>
{"cb_tool_name": "test_tool"}
</codebuff_tool_call>
After text`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('Before text\n\nAfter text')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('test_tool')
    })

    it('should handle tool call split across multiple chunks', () => {
      const state = createStreamParserState()

      // First chunk: start tag and partial content
      const result1 = parseStreamChunk('<codebuff_tool_call>\n{"cb_tool', state)
      expect(result1.filteredText).toBe('')
      expect(result1.toolCalls).toEqual([])

      // Second chunk: rest of content and end tag
      const result2 = parseStreamChunk('_name": "test_tool"}\n</codebuff_tool_call>', state)
      expect(result2.filteredText).toBe('')
      expect(result2.toolCalls).toHaveLength(1)
      expect(result2.toolCalls[0].toolName).toBe('test_tool')
    })

    it('should handle partial start tag at chunk boundary', () => {
      const state = createStreamParserState()

      // First chunk ends with partial start tag
      const result1 = parseStreamChunk('Some text<codebuff', state)
      expect(result1.filteredText).toBe('Some text')
      expect(result1.toolCalls).toEqual([])

      // Second chunk completes the start tag
      const result2 = parseStreamChunk('_tool_call>\n{"cb_tool_name": "test"}\n</codebuff_tool_call>', state)
      expect(result2.filteredText).toBe('')
      expect(result2.toolCalls).toHaveLength(1)
    })

    it('should handle multiple tool calls in sequence', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>
{"cb_tool_name": "tool_a"}
</codebuff_tool_call>
Middle text
<codebuff_tool_call>
{"cb_tool_name": "tool_b"}
</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('\nMiddle text\n')
      expect(result.toolCalls).toHaveLength(2)
      expect(result.toolCalls[0].toolName).toBe('tool_a')
      expect(result.toolCalls[1].toolName).toBe('tool_b')
    })

    it('should handle empty chunks', () => {
      const state = createStreamParserState()
      const result = parseStreamChunk('', state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toEqual([])
    })

    it('should remove cb_easp from input', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>
{"cb_tool_name": "test", "cb_easp": true, "path": "foo.ts"}
</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].input).toEqual({ path: 'foo.ts' })
      expect(result.toolCalls[0].input).not.toHaveProperty('cb_easp')
    })

    it('should handle tool call without newlines after/before tags', () => {
      const state = createStreamParserState()
      // No newline after start tag or before end tag
      const chunk = `<codebuff_tool_call>{"cb_tool_name": "test_tool"}</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('test_tool')
    })

    it('should handle tool call with CRLF line endings', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>\r\n{"cb_tool_name": "test_tool"}\r\n</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('test_tool')
    })

    it('should handle tool call with extra whitespace', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>  
  {"cb_tool_name": "test_tool"}  
  </codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('test_tool')
    })

    it('should tolerate markdown fences and trailing commas inside tool call JSON', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>
\`\`\`json
{
  "cb_tool_name": "test_tool",
  "path": "foo.ts",
  "items": [
    "a",
  ],
}
\`\`\`
</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('test_tool')
      expect(result.toolCalls[0].input).toEqual({
        path: 'foo.ts',
        items: ['a'],
      })
    })

    it('should not rewrite comma-brace sequences inside valid JSON strings', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>
{"cb_tool_name": "test_tool", "content": "keep ,} and ,] intact"}
</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].input).toEqual({
        content: 'keep ,} and ,] intact',
      })
    })

    it('should extract the JSON object when extra text appears inside the tool call tag', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>
Here is the edit:
{"cb_tool_name": "test_tool", "path": "foo.ts"}
Done.
</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('test_tool')
      expect(result.toolCalls[0].input).toEqual({ path: 'foo.ts' })
    })

    it('should handle realistic streaming scenario with small chunks', () => {
      const state = createStreamParserState()
      const allChunks: string[] = []
      const allToolCalls: any[] = []

      // Simulate streaming in small chunks like a real LLM would
      const fullText = `<think>
Thinking about the task...
</think>

<codebuff_tool_call>
{"cb_tool_name": "propose_str_replace", "path": "test.ts"}
</codebuff_tool_call>`

      // Stream in ~10 char chunks
      for (let i = 0; i < fullText.length; i += 10) {
        const chunk = fullText.slice(i, i + 10)
        const result = parseStreamChunk(chunk, state)
        allChunks.push(result.filteredText)
        allToolCalls.push(...result.toolCalls)
      }

      const combinedText = allChunks.join('')
      expect(combinedText).toBe('<think>\nThinking about the task...\n</think>\n\n')
      expect(allToolCalls).toHaveLength(1)
      expect(allToolCalls[0].toolName).toBe('propose_str_replace')
      expect(allToolCalls[0].input.path).toBe('test.ts')
    })

    it('should handle end tag split across chunks', () => {
      const state = createStreamParserState()
      const allChunks: string[] = []
      const allToolCalls: any[] = []

      // Send start tag and content
      let result = parseStreamChunk('<codebuff_tool_call>\n{"cb_tool_name": "test"}\n</', state)
      allChunks.push(result.filteredText)
      allToolCalls.push(...result.toolCalls)

      // Send rest of end tag
      result = parseStreamChunk('codebuff_tool_call>', state)
      allChunks.push(result.filteredText)
      allToolCalls.push(...result.toolCalls)

      expect(allToolCalls).toHaveLength(1)
      expect(allToolCalls[0].toolName).toBe('test')
    })

    it('should report invalid JSON inside a completed tool call', () => {
      const state = createStreamParserState()
      const chunk = `<codebuff_tool_call>
{"cb_tool_name": "test_tool",
</codebuff_tool_call>`

      const result = parseStreamChunk(chunk, state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toEqual([])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].code).toBe('invalid_tool_call_json')
      expect(result.errors[0].message).toContain('JSON parsing failed')
    })

    it('should report and clear unterminated tool call buffers past the limit', () => {
      const state = createStreamParserState({ maxToolCallBufferLength: 8 })

      const result = parseStreamChunk('<codebuff_tool_call>123456789', state)

      expect(result.filteredText).toBe('')
      expect(result.toolCalls).toEqual([])
      expect(result.errors).toEqual([
        {
          code: 'tool_call_buffer_exceeded',
          message:
            'Discarded unterminated codebuff_tool_call content after 9 buffered characters (limit 8).',
          bufferedLength: 9,
          maxBufferLength: 8,
        },
      ])
      expect(state.buffer).toBe('')
      expect(state.insideToolCall).toBe(false)
    })
  })
})
