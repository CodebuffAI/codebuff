import React from 'react'
import { render } from 'ink'
import ChatPage from './pages/chat'

// Set up environment variables for WebSocket connection
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'wss://api.codebuff.dev'

// Add debug logging
console.error('[DEBUG] Using WebSocket URL:', backendUrl)

// Ensure environment variable is set
process.env.NEXT_PUBLIC_BACKEND_URL = backendUrl

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('[DEBUG] Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[DEBUG] Uncaught Exception:', error)
})

// Entry point for the CLI application
render(<ChatPage />)
