import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import ResponsiveBox from '../ui/ResponsiveBox'
import type { Message } from '../../../common/src/actions'
type ExtendedMessage = Message | { role: 'system'; content: string }
import { webSocketClient } from '../client-websocket'
import { TOOL_RESULT_MARKER } from '../../../common/src/constants'
import Spinner from '../ui/Spinner'

const ChatPage: React.FC = () => {
  useEffect(() => {
    // Connect WebSocket when component mounts
    const connectWebSocket = async () => {
      try {
        console.error('[DEBUG] Attempting to connect to WebSocket...')
        await webSocketClient.connect()
        console.error('[DEBUG] WebSocket connected successfully')
        setIsConnected(true)
        setConnectionError(null)
      } catch (error) {
        console.error('[DEBUG] WebSocket connection failed:', error)
        setConnectionError('Failed to connect to server. Will retry automatically...')
        setIsConnected(false)
      }
    }
    
    connectWebSocket()
    
    // Set up message callback
    webSocketClient.setMessageCallback((message) => {
      if (message.role === 'assistant') {
        setIsProcessing(false)
      }
      setMessages(prev => [...prev, message])
    })

    return () => {
      webSocketClient.setMessageCallback(() => {})
    }
  }, [])
  const [messages, setMessages] = useState<ExtendedMessage[]>([
    { role: 'assistant', content: 'Welcome to Codebuff CLI! How can I help you today?' }
  ])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)

  // Update usage when WebSocket client reports it
  useEffect(() => {
    const updateUsage = (data: { usage: number; limit: number }) => {
      setUsage({ used: data.usage, limit: data.limit })
    }
    webSocketClient.onUsageUpdate(updateUsage)
    return () => webSocketClient.offUsageUpdate(updateUsage)
  }, [])

  const handleSubmit = (value: string) => {
    if (!value.trim()) return

    setIsProcessing(true)
    
    // Add user message
    const userMessage: Message = { role: 'user', content: value.trim() }
    setMessages([...messages, userMessage])
    
    // Clear input
    setInput('')

    // Send message through WebSocket
    webSocketClient.sendMessage(value.trim()).catch(error => {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${error.message}` }])
      setIsProcessing(false)
    })
  }

  return (
    <ResponsiveBox>
      <Box flexDirection="column" padding={1}>
        {/* Connection Status */}
        {!isConnected && (
          <Box marginBottom={1}>
            <Text color="yellow">⚡ {connectionError || 'Connecting to server...'}</Text>
          </Box>
        )}
        
        {/* Message History */}
        <Box flexDirection="column" flexGrow={1}>
          {messages.map((msg, i) => {
            const isToolResult = msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith(TOOL_RESULT_MARKER)
            const messageColor = {
              assistant: 'green',
              user: isToolResult ? 'yellow' : 'blue',
              system: 'red'
            }[msg.role]
            const icon = {
              assistant: '🤖 ',
              user: isToolResult ? '🔧 ' : '👤 ',
              system: '⚠️ '
            }[msg.role]
            
            return (
              <Box key={i} marginY={1}>
                <Text color={messageColor}>
                  {icon}
                  {typeof msg.content === 'string' 
                    ? isToolResult
                      ? msg.content.replace(TOOL_RESULT_MARKER + '\n', '')
                      : msg.content
                    : JSON.stringify(msg.content)
                  }
                </Text>
              </Box>
            )
          })}
          {isProcessing && (
            <Box marginY={1}>
              <Text color="yellow">
                <Spinner /> Processing...
              </Text>
            </Box>
          )}
        </Box>

        {/* Usage Info */}
        {usage && (
          <Box marginY={1}>
            <Text color="gray">
              Credits used: {usage.used} / {usage.limit}
            </Text>
          </Box>
        )}

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
