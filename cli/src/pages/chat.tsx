import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { useTerminalSize } from '../hooks/use-terminal-size'
import { webSocketClient } from '../client-websocket'
import type { Message, MessageContentObject } from '../../../common/src/actions'

type ExtendedMessage = {
  role: 'assistant' | 'user' | 'system'
  content: string
}

// Transform WebSocket message to ExtendedMessage format
const transformMessage = (message: Message | { role: 'system'; content: string }): ExtendedMessage => {
  if ('type' in message) {
    return message as ExtendedMessage
  }

  if (message.role === 'system') {
    return message
  }

  const content = Array.isArray(message.content)
    ? message.content
        .map((c: MessageContentObject) => {
          switch (c.type) {
            case 'text':
              return c.text
            case 'tool_use':
              return `[Tool Call: ${c.name}]`
            case 'tool_result':
              return `[Tool Result: ${c.content}]`
            default:
              return ''
          }
        })
        .join('\n')
    : message.content

  return {
    role: message.role,
    content: content,
  }
}

export const Chat: React.FC = () => {
  // Track viewport position and chat state
  const [startIndex, setStartIndex] = useState(0)
  const [viewportSize, setViewportSize] = useState(10) // Default to 10 messages visible
  const { dimensions: [cols, rows] } = useTerminalSize()
  const [messages, setMessages] = useState<ExtendedMessage[]>([])
  const [input, setInput] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  // Update viewport size based on terminal dimensions
  useEffect(() => {
    const margin = 4 // Space for input, status line, and padding
    const linesPerMessage = 2 // Each message takes ~2 lines including spacing
    // Force a smaller viewport to test scrolling
    const maxVisibleMessages = Math.min(8, Math.max(1, Math.floor((rows - margin) / linesPerMessage)))
    setViewportSize(maxVisibleMessages)
    console.log(`Viewport size: ${maxVisibleMessages} (rows: ${rows}, margin: ${margin})`)
  }, [rows])

  // Connect to WebSocket and set up message handling
  useEffect(() => {
    // Skip WebSocket connection for testing
    setIsConnected(true)
    return () => {}
  }, [])

  // Initialize with test messages
  useEffect(() => {
    const generateTestMessage = (index: number): ExtendedMessage => {
      const role: ExtendedMessage['role'] = index % 2 === 0 ? 'user' : 'assistant'
      return {
        role,
        content: `Test message ${index + 1}: ${role === 'user' ? 'User asking about feature' : 'Assistant providing detailed response'} ${'\n'.repeat(index % 2)}`
      }
    }

    const testMessages: ExtendedMessage[] = [
      {
        role: 'assistant',
        content: 'Welcome to Codebuff CLI! How can I help you today?'
      },
      ...Array.from({ length: 25 }, (_, i) => generateTestMessage(i)),
      {
        role: 'system',
        content: '[Tool Call: git-status] Checking repository status...'
      },
      {
        role: 'system',
        content: '[Tool Result: Success] Repository is clean and up to date'
      },
      ...Array.from({ length: 25 }, (_, i) => generateTestMessage(i + 25)),
      {
        role: 'system',
        content: '[Tool Call: file-search] Searching for TypeScript files...'
      },
      {
        role: 'system',
        content: '[Tool Result: Found] Located 25 TypeScript files in the project'
      },
      {
        role: 'assistant',
        content: 'I found several TypeScript files. Would you like me to analyze them?'
      }
    ]
    setMessages(testMessages)
  }, [])

  // Register keyboard controls for scrolling and input
  useInput((inputText, key) => {
    if (key.upArrow) {
      setStartIndex(prev => {
        const newIndex = Math.max(0, prev - 1)
        console.log(`Scrolling up: ${prev} -> ${newIndex} (viewport: ${viewportSize}, total: ${messages.length})`)
        return newIndex
      })
    }
    if (key.downArrow) {
      setStartIndex(prev => {
        const newIndex = Math.min(messages.length - viewportSize, prev + 1)
        console.log(`Scrolling down: ${prev} -> ${newIndex} (viewport: ${viewportSize}, total: ${messages.length})`)
        return newIndex
      })
    }
    if (key.pageUp) {
      setStartIndex(prev => {
        const newIndex = Math.max(0, prev - viewportSize)
        console.log(`Page up: ${prev} -> ${newIndex} (viewport: ${viewportSize}, total: ${messages.length})`)
        return newIndex
      })
    }
    if (key.pageDown) {
      setStartIndex(prev => {
        const newIndex = Math.min(messages.length - viewportSize, prev + viewportSize)
        console.log(`Page down: ${prev} -> ${newIndex} (viewport: ${viewportSize}, total: ${messages.length})`)
        return newIndex
      })
    }
    if (key.return) {
      if (input.trim()) {
        // Add user message
        const userMessage: ExtendedMessage = {
          role: 'user',
          content: input.trim()
        }
        setMessages(prev => [...prev, userMessage])
        
        // Simulate assistant response
        setTimeout(() => {
          const assistantMessage: ExtendedMessage = {
            role: 'assistant',
            content: `Echo: ${input.trim()}`
          }
          setMessages(prev => {
            const newMessages = [...prev, assistantMessage]
            // Auto-scroll to bottom for new messages
            setTimeout(() => {
              setStartIndex(Math.max(0, newMessages.length - viewportSize))
              console.log(`Auto-scrolling to bottom: startIndex = ${Math.max(0, newMessages.length - viewportSize)}`)
            }, 0)
            return newMessages
          })
        }, 500)
        
        setInput('')
      }
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1))
      console.log('Input backspace/delete')
    } else if (!key.ctrl && !key.meta && inputText) {
      setInput(prev => prev + inputText)
      console.log(`Input text: "${inputText}"`)
    }
  })

  // Compute visible messages and log viewport state
  const visibleMessages = messages.slice(startIndex, startIndex + viewportSize)
  const endIndex = Math.min(startIndex + viewportSize, messages.length)
  
  useEffect(() => {
    console.log(`Viewport state:
- Total messages: ${messages.length}
- Viewport size: ${viewportSize}
- Current range: ${startIndex + 1}-${endIndex}
- Messages above: ${startIndex}
- Messages below: ${messages.length - endIndex}
- Tool calls visible: ${visibleMessages.filter(m => m.role === 'system').length}`)
  }, [startIndex, viewportSize, messages.length])

  // Clear screen and reset cursor
  useEffect(() => {
    // Clear screen, reset cursor, and hide cursor
    process.stdout.write('\x1b[2J\x1b[0f\x1b[?25l')
    // Show cursor when component unmounts
    return () => {
      process.stdout.write('\x1b[?25h')
    }
  }, [startIndex, viewportSize, messages.length])

  return (
    <Box flexDirection="column">
      {/* Scroll indicator */}
      {startIndex > 0 && (
        <Box marginY={1}>
          <Text color="gray" dimColor>▲ {startIndex} more message{startIndex !== 1 ? 's' : ''} above (↑ to scroll up)</Text>
        </Box>
      )}

      {/* Messages */}
      {visibleMessages.map((msg, i) => (
        <Box key={`${startIndex + i}`} marginY={1}>
          <Text color={msg.role === 'assistant' ? 'green' : msg.role === 'user' ? 'blue' : 'yellow'}>
            {msg.role === 'assistant' ? '🤖 ' : msg.role === 'user' ? '👤 ' : '🔧 '}
            {msg.role === 'system' ? `[${msg.content}]` : msg.content}
          </Text>
        </Box>
      ))}

      {/* Bottom scroll indicator */}
      {startIndex + viewportSize < messages.length && (
        <Box marginY={1}>
          <Text color="gray" dimColor>▼ {messages.length - (startIndex + viewportSize)} more message{messages.length - (startIndex + viewportSize) !== 1 ? 's' : ''} below (↓ to scroll down)</Text>
        </Box>
      )}

      {/* Status line */}
      <Box marginY={1}>
        <Text color="gray">
          Showing messages {startIndex + 1}-{Math.min(startIndex + viewportSize, messages.length)} of {messages.length}
          {' | '}Page Up/Down for faster scrolling
        </Text>
      </Box>

      {/* Input line */}
      <Box marginY={1}>
        <Text color={isConnected ? 'green' : 'red'}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </Text>
        <Text> | </Text>
        <Text color="blue">{'> ' + input}</Text>
      </Box>
    </Box>
  )
}

export default Chat
