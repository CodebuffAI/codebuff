import { describe, expect, it } from 'bun:test'
import { transformMessage } from '../screenshot-formatter'
import { Message, MessageContentObject } from 'common/actions'

describe('transformMessage', () => {
  it('should not modify messages without screenshots', () => {
    const message: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello' } as MessageContentObject],
    }
    const result = transformMessage(message, 'openai')
    expect(result).toEqual(message)
  })

  it('should handle string content messages', () => {
    const message: Message = {
      role: 'assistant',
      content: 'Hello',
    }
    const result = transformMessage(message, 'openai')
    expect(result).toEqual(message)
  })

  it('should handle string content containing JSON with screenshot', () => {
    const base64Data = 'base64screenshot'
    const message: Message = {
      role: 'assistant',
      content: JSON.stringify({
        success: true,
        screenshot: base64Data,
        logs: ['test']
      })
    }

    const result = transformMessage(message, 'openai')
    expect(result.content).toBeInstanceOf(Array)
    const content = result.content as MessageContentObject[]
    
    expect(content).toHaveLength(2)
    
    // Check text content
    const textBlock = content[0]
    expect(textBlock.type).toBe('text')
    const parsedText = JSON.parse((textBlock as any).text)
    expect(parsedText.screenshot).toBeUndefined()
    expect(parsedText.logs).toEqual(['test'])
    
    // Check image block
    const imageBlock = content[1]
    expect(imageBlock.type).toBe('image')
    expect((imageBlock as any).source.data).toBe(base64Data)
  })

  it('should extract screenshot from tool result', () => {
    const base64Data = 'base64screenshot'
    const message: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool_result',
          content: JSON.stringify({
            success: true,
            screenshot: base64Data,
            logs: ['test'],
          }),
        } as MessageContentObject,
      ],
    }

    const result = transformMessage(message, 'openai')
    const content = result.content as MessageContentObject[]
    
    expect(content).toHaveLength(2)
    
    // Check tool result
    const toolResult = content[0]
    expect(toolResult.type).toBe('tool_result')
    const parsedToolResult = JSON.parse((toolResult as any).content)
    expect(parsedToolResult.screenshot).toBeUndefined()
    expect(parsedToolResult.logs).toEqual(['test'])
    
    // Check image block
    const imageBlock = content[1]
    expect(imageBlock.type).toBe('image')
    expect((imageBlock as any).source.data).toBe(base64Data)
  })

  it('should handle multiple screenshots in message content', () => {
    const message: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool_result',
          content: JSON.stringify({ screenshot: 'base64-1' }),
        } as MessageContentObject,
        {
          type: 'tool_result',
          content: JSON.stringify({ screenshot: 'base64-2' }),
        } as MessageContentObject,
      ],
    }

    const result = transformMessage(message, 'openai')
    expect((result.content as MessageContentObject[]).length).toBe(4)
  })

  describe('TOOL_RESULT_MARKER handling', () => {
    it('should handle tool result with TOOL_RESULT_MARKER in string content', () => {
      const base64Data = 'base64screenshot'
      const message: Message = {
        role: 'assistant',
        content: `[TOOL_RESULT]${JSON.stringify({
          success: true,
          screenshot: base64Data,
          logs: ['test'],
        })}`,
      }

      const result = transformMessage(message, 'openai')
      expect(result.content).toBeInstanceOf(Array)
      const content = result.content as MessageContentObject[]
      
      expect(content).toHaveLength(2)
      
      // Check text content
      const textBlock = content[0]
      expect(textBlock.type).toBe('text')
      const parsedText = JSON.parse((textBlock as any).text)
      expect(parsedText.screenshot).toBeUndefined()
      expect(parsedText.logs).toEqual(['test'])
      
      // Check image block
      const imageBlock = content[1]
      expect(imageBlock.type).toBe('image')
      expect((imageBlock as any).source.data).toBe(base64Data)
    })

    it('should handle tool result with TOOL_RESULT_MARKER in tool_result content', () => {
      const base64Data = 'base64screenshot'
      const message: Message = {
        role: 'assistant',
        content: [
          {
            type: 'tool_result',
            content: `[TOOL_RESULT]${JSON.stringify({
              success: true,
              screenshot: base64Data,
              logs: ['test'],
            })}`,
          } as MessageContentObject,
        ],
      }

      const result = transformMessage(message, 'openai')
      const content = result.content as MessageContentObject[]
      
      expect(content).toHaveLength(2)
      
      // Check tool result
      const toolResult = content[0]
      expect(toolResult.type).toBe('tool_result')
      const parsedToolResult = JSON.parse((toolResult as any).content)
      expect(parsedToolResult.screenshot).toBeUndefined()
      expect(parsedToolResult.logs).toEqual(['test'])
      
      // Check image block
      const imageBlock = content[1]
      expect(imageBlock.type).toBe('image')
      expect((imageBlock as any).source.data).toBe(base64Data)
    })

    it('should handle multiple TOOL_RESULT_MARKERs in array content', () => {
      const message: Message = {
        role: 'assistant',
        content: [
          {
            type: 'tool_result',
            content: `[TOOL_RESULT]${JSON.stringify({ screenshot: 'base64-1' })}`,
          } as MessageContentObject,
          {
            type: 'tool_result',
            content: `[TOOL_RESULT]${JSON.stringify({ screenshot: 'base64-2' })}`,
          } as MessageContentObject,
        ],
      }

      const result = transformMessage(message, 'openai')
      const content = result.content as MessageContentObject[]
      expect(content).toHaveLength(4)
      
      // Check first tool result and image
      expect(content[0].type).toBe('tool_result')
      expect(content[1].type).toBe('image')
      expect((content[1] as any).source.data).toBe('base64-1')
      
      // Check second tool result and image
      expect(content[2].type).toBe('tool_result')
      expect(content[3].type).toBe('image')
      expect((content[3] as any).source.data).toBe('base64-2')
    })
  })

  it('should handle invalid JSON in tool result', () => {
    const message: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool_result',
          content: 'invalid json',
        } as MessageContentObject,
      ],
    }

    const result = transformMessage(message, 'openai')
    expect(result).toEqual(message)
  })

  it('should apply ephemeral caching for Anthropic', () => {
    const message: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool_result',
          content: JSON.stringify({ screenshot: 'base64data' }),
        } as MessageContentObject,
      ],
    }

    const result = transformMessage(message, 'anthropic')
    const content = result.content as MessageContentObject[]
    const imageBlock = content[1]
    expect(imageBlock.type).toBe('image')
    expect((imageBlock as any).cache_control).toEqual({ type: 'ephemeral' })
  })

  it('should handle large screenshots with OpenAI', () => {
    // Create a large base64 string
    const largeBase64 = 'x'.repeat(250000)
    const message: Message = {
      role: 'assistant',
      content: [
        {
          type: 'tool_result',
          content: JSON.stringify({ screenshot: largeBase64 }),
        } as MessageContentObject,
      ],
    }

    const result = transformMessage(message, 'openai')
    const content = result.content as MessageContentObject[]
    const imageBlock = content[1]
    expect(imageBlock.type).toBe('image')
    expect((imageBlock as any).cache_control).toEqual({ type: 'ephemeral' })
  })
})
