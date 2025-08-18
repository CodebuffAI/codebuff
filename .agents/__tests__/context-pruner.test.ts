import { describe, test, expect, beforeEach } from 'bun:test'
import contextPruner from '../context-pruner'
import type { Message } from '../types/agent-definition'

describe('context-pruner handleSteps', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const createMessage = (role: 'user' | 'assistant', content: string): Message => ({
    role,
    content,
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    const generator = contextPruner.handleSteps!({ agentState: mockAgentState })
    const results: any[] = []
    let result = generator.next()
    while (!result.done) {
      if (typeof result.value === 'object') {
        results.push(result.value)
      }
      result = generator.next()
    }
    return results
  }

  test('does nothing when messages are under token limit', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi there!'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      toolName: 'set_messages',
      input: {
        messages,
      },
    })
  })

  test('removes spawn_agent_inline call for context-pruner from last assistant message', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'I will spawn the context-pruner agent.\n\n<codebuff_tool_call>\n{\n  "cb_tool_name": "spawn_agent_inline",\n  "agent_type": "context-pruner"\n}\n</codebuff_tool_call>'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toHaveLength(1)
    expect(results[0].input.messages[0]).toEqual(createMessage('user', 'Hello'))
  })

  test('does not remove last message if it does not contain context-pruner spawn call', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Regular response without spawn call'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toHaveLength(2)
  })

  test('removes old terminal command results while keeping recent 5', () => {
    // Create content large enough to exceed 200k token limit (~600k chars)
    const largeContent = 'x'.repeat(150000)
    
    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      // 7 terminal commands (should keep last 5, simplify first 2)
      ...Array.from({ length: 7 }, (_, i) => 
        createMessage('assistant', `Command ${i + 1}\n<tool_result><tool>run_terminal_command</tool><result>Large output ${i + 1}: ${'y'.repeat(1000)}</result></tool_result>`)
      ),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Check that first 2 terminal commands are simplified (should have been replaced)
    const firstTerminalMessage = resultMessages.find((m: any) => 
      typeof m.content === 'string' && m.content.includes('Command 1')
    )
    expect(firstTerminalMessage?.content).toContain('[Output omitted]')
    
    // Check that recent terminal commands are preserved (but may be processed by large tool result pass)
    const recentTerminalMessage = resultMessages.find((m: any) => 
      typeof m.content === 'string' && m.content.includes('Command 7')
    )
    // The recent message should exist, but if it's large, it may get processed by Pass 2
    expect(recentTerminalMessage).toBeDefined()
    expect(recentTerminalMessage?.content).toContain('Command 7')
  })

  test('removes large tool results', () => {
    // Create content large enough to exceed 200k token limit (~600k chars) to trigger terminal pass
    const largeContent = 'z'.repeat(150000)
    const largeToolResult = 'x'.repeat(2000) // > 1000 chars
    
    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      // Message with large tool result (total message > 1000 chars)
      createMessage('assistant', `Some text before <tool_result><tool>read_files</tool><result>${largeToolResult}</result></tool_result> some text after`),
      createMessage('assistant', `<tool_result><tool>code_search</tool><result>Small result</result></tool_result>`),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Large tool result should be simplified
    const largeResultMessage = resultMessages.find((m: any) => 
      typeof m.content === 'string' && m.content.includes('read_files')
    )
    expect(largeResultMessage?.content).toContain('[Large tool result omitted]')
    
    // Small tool result should be preserved
    const smallResultMessage = resultMessages.find((m: any) => 
      typeof m.content === 'string' && m.content.includes('Small result')
    )
    expect(smallResultMessage?.content).toContain('Small result')
  })

  test('performs message-level pruning when other passes are insufficient', () => {
    // Create many large messages to exceed token limit
    const largeContent = 'z'.repeat(50000)
    
    const messages = Array.from({ length: 20 }, (_, i) => 
      createMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i + 1}: ${largeContent}`)
    )

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Should have fewer messages due to pruning
    expect(resultMessages.length).toBeLessThan(messages.length)
    
    // Should contain replacement messages
    const hasReplacementMessage = resultMessages.some((m: any) => 
      typeof m.content === 'string' && m.content.includes('Previous message(s) omitted due to length')
    )
    expect(hasReplacementMessage).toBe(true)
  })

  test('preserves messages with keepDuringTruncation flag', () => {
    const largeContent = 'w'.repeat(50000)
    
    const messages = [
      createMessage('user', `Message 1: ${largeContent}`),
      { ...createMessage('assistant', `Important message: ${largeContent}`), keepDuringTruncation: true },
      createMessage('user', `Message 3: ${largeContent}`),
    ] as any[]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Important message should be preserved
    const importantMessage = resultMessages.find((m: any) => 
      typeof m.content === 'string' && m.content.includes('Important message')
    )
    expect(importantMessage).toBeDefined()
  })

  test('handles non-string message content', () => {
    const messages = [
      createMessage('user', 'Hello'),
      { role: 'assistant', content: { type: 'object', data: 'test' } },
    ] as any[]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Should convert non-string content to JSON string for processing
    const resultMessages = results[0].input.messages
    expect(resultMessages).toHaveLength(2)
    // The content might remain as object if no processing was needed, or become string if processed
    expect(resultMessages[1]).toBeDefined()
  })

  test('handles empty message history', () => {
    const messages: Message[] = []

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toEqual([])
  })

  test('token counting approximation works', () => {
    // Test the internal token counting logic indirectly
    const shortMessage = createMessage('user', 'Hi')
    const longMessage = createMessage('user', 'x'.repeat(300)) // ~100 tokens
    
    // Short message should not trigger pruning
    let results = runHandleSteps([shortMessage])
    expect(results[0].input.messages).toHaveLength(1)
    
    // Very long message should potentially trigger some processing
    results = runHandleSteps([longMessage])
    expect(results).toHaveLength(1)
  })
})

describe('context-pruner edge cases', () => {
  let mockAgentState: any

  beforeEach(() => {
    mockAgentState = {
      messageHistory: [] as Message[],
    }
  })

  const createMessage = (role: 'user' | 'assistant', content: string): Message => ({
    role,
    content,
  })

  const runHandleSteps = (messages: Message[]) => {
    mockAgentState.messageHistory = messages
    const generator = contextPruner.handleSteps!({ agentState: mockAgentState })
    const results: any[] = []
    let result = generator.next()
    while (!result.done) {
      if (typeof result.value === 'object') {
        results.push(result.value)
      }
      result = generator.next()
    }
    return results
  }

  test('handles malformed terminal command tool results', () => {
    const largeContent = 'x'.repeat(100000)
    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', '<tool>run_terminal_command</tool>'), // Missing tool_result wrapper
      createMessage('assistant', '<tool_result><tool>run_terminal_command</tool>'), // Missing result
      createMessage('assistant', '<tool_result><tool>run_terminal_command</tool><result>[Output omitted]</result></tool_result>'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Should handle malformed entries gracefully
    expect(resultMessages.length).toBeGreaterThan(0)
    
    // Valid terminal command should be processed correctly
    const validCommand = resultMessages.find((m: any) => 
      typeof m.content === 'string' && m.content.includes('<tool_result><tool>run_terminal_command</tool><result>[Output omitted]</result></tool_result>')
    )
    expect(validCommand).toBeDefined()
  })

  test('handles nested tool results in terminal commands', () => {
    const largeContent = 'x'.repeat(100000)
    const nestedToolResult = `
      <tool_result><tool>run_terminal_command</tool><result>[Output omitted]</result></tool_result>
        </result>
      </tool_result>
    `
    
    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', nestedToolResult),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Should handle nested XML gracefully without breaking
    expect(results[0].input.messages).toBeDefined()
  })

  test('handles exact token limit boundary', () => {
    // Create content that when stringified is close to the 200k token limit
    // 200k tokens ≈ 600k characters (rough approximation used in code)
    const boundaryContent = 'x'.repeat(599000)
    
    const messages = [
      createMessage('user', boundaryContent),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    // Should handle boundary condition without errors
    expect(results[0].input.messages).toBeDefined()
  })

  test('preserves message order after pruning', () => {
    const largeContent = 'x'.repeat(50000)
    
    const messages = [
      createMessage('user', `First: ${largeContent}`),
      createMessage('assistant', `Second: ${largeContent}`),
      createMessage('user', `Third: ${largeContent}`),
      createMessage('assistant', `Fourth: ${largeContent}`),
      createMessage('user', `Fifth: ${largeContent}`),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Check that remaining messages maintain chronological order
    let previousIndex = -1
    resultMessages.forEach((message: any) => {
      if (typeof message.content === 'string') {
        const match = message.content.match(/(First|Second|Third|Fourth|Fifth):/)
        if (match) {
          const currentIndex = ['First', 'Second', 'Third', 'Fourth', 'Fifth'].indexOf(match[1])
          expect(currentIndex).toBeGreaterThan(previousIndex)
          previousIndex = currentIndex
        }
      }
    })
  })

  test('handles messages with only whitespace content', () => {
    const messages = [
      createMessage('user', '   \n\t  '),
      createMessage('assistant', ''),
      createMessage('user', 'Normal content'),
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    expect(results[0].input.messages).toHaveLength(3)
  })

  test('handles tool results with various sizes around 1000 char threshold', () => {
    // Create content large enough to exceed 200k token limit to trigger pruning
    const largeContent = 'x'.repeat(150000)
    
    const messages = [
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('user', largeContent),
      createMessage('assistant', largeContent),
      createMessage('assistant', `<tool_result><tool>test</tool><result>${'a'.repeat(999)}</result></tool_result>`), // Just under 1000
      createMessage('assistant', `<tool_result><tool>test</tool><result>${'b'.repeat(1000)}</result></tool_result>`), // Exactly 1000  
      createMessage('assistant', `<tool_result><tool>test</tool><result>${'c'.repeat(1001)}</result></tool_result>`), // Just over 1000
    ]

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Check that some tool result processing occurred
    const hasToolResults = resultMessages.some((m: any) => 
      typeof m.content === 'string' && m.content.includes('<tool_result>')
    )
    expect(hasToolResults).toBe(true)
    
    // Check that large tool result replacement occurred (may replace all tool results over 1000 chars)
    const hasLargeToolResultReplacement = resultMessages.some((m: any) => 
      typeof m.content === 'string' && m.content.includes('Large tool result omitted')
    )
    expect(hasLargeToolResultReplacement).toBe(true)
  })

  test('handles spawn_agent_inline detection with variations', () => {
    const testCases = [
      'Regular message with spawn_agent_inline but not for context-pruner',
      'spawn_agent_inline call for "context-pruner" with quotes',
      'spawn_agent_inline\n  "agent_type": "context-pruner"',
      'Multiple spawn_agent_inline calls, one for context-pruner',
    ]

    testCases.forEach((content, index) => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', content),
      ]

      const results = runHandleSteps(messages)

      if (content.includes('context-pruner')) {
        // Should remove the message containing context-pruner spawn
        expect(results[0].input.messages).toHaveLength(1)
      } else {
        // Should preserve the message
        expect(results[0].input.messages).toHaveLength(2)
      }
    })
  })

  test('handles multiple consecutive replacement messages in pruning', () => {
    // Create scenario where multiple consecutive messages would be replaced
    const largeContent = 'x'.repeat(60000)
    
    const messages = Array.from({ length: 10 }, (_, i) => 
      createMessage('user', `Message ${i}: ${largeContent}`)
    )

    const results = runHandleSteps(messages)

    expect(results).toHaveLength(1)
    const resultMessages = results[0].input.messages
    
    // Should not have consecutive replacement messages
    let consecutiveReplacements = 0
    let maxConsecutive = 0
    
    resultMessages.forEach((message: any) => {
      if (typeof message.content === 'string' && message.content.includes('Previous message(s) omitted')) {
        consecutiveReplacements++
      } else {
        maxConsecutive = Math.max(maxConsecutive, consecutiveReplacements)
        consecutiveReplacements = 0
      }
    })
    
    maxConsecutive = Math.max(maxConsecutive, consecutiveReplacements)
    expect(maxConsecutive).toBeLessThanOrEqual(1) // No more than 1 consecutive replacement
  })
})
