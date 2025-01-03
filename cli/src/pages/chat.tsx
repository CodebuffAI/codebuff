import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import ResponsiveBox from '../ui/ResponsiveBox'
import type { Message } from '../../../common/src/actions'
import { webSocketClient } from '../client-websocket'

const ChatPage: React.FC = () => {
  useEffect(() => {
    // Connect WebSocket when component mounts
    webSocketClient.connect()
    
    // Set up message callback
    webSocketClient.setMessageCallback((message) => {
      setMessages(prev => [...prev, message])
    })
  }, [])
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Welcome to Codebuff CLI! How can I help you today?' }
  ])
  const [input, setInput] = useState('')

  const handleSubmit = (value: string) => {
    if (!value.trim()) return

    // Add user message
    const userMessage: Message = { role: 'user', content: value.trim() }
    setMessages([...messages, userMessage])
    
    // Clear input
    setInput('')

    // Send message through WebSocket
    webSocketClient.sendMessage(value.trim())
  }

  return (
    <ResponsiveBox>
      <Box flexDirection="column" padding={1}>
        {/* Message History */}
        <Box flexDirection="column" flexGrow={1}>
          {messages.map((msg, i) => (
            <Box key={i} marginY={1}>
              <Text color={msg.role === 'assistant' ? 'green' : 'blue'}>
                {msg.role === 'assistant' ? '🤖 ' : '👤 '}
                {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
              </Text>
            </Box>
          ))}
        </Box>

        {/* Input Area */}
        <Box marginTop={1}>
          <Text>{'> '}</Text>
          <TextInput 
            value={input} 
            onChange={setInput} 
            onSubmit={handleSubmit}
            placeholder="Type your message..."
          />
        </Box>
      </Box>
    </ResponsiveBox>
  )
}

export default ChatPage
