import { WebSocketClient } from './client-websocket'
import { green, red, yellow, bold } from 'picocolors'
import path from 'path'
import { TOOL_RESULT_MARKER } from '../../common/src/constants'
import type { Message, ServerAction } from '../../common/src/actions'
import type { FileVersion } from '../../common/src/util/file'
import { ChatStorage } from './util/chat-storage'
import { calculateFingerprint } from './util/fingerprint'
import { CREDENTIALS_PATH } from './util/credentials'
import * as fs from 'fs'
import os from 'os'

async function testToolCalls() {
  console.log(bold('Testing tool call functionality...'))
  
  // Set up test environment
  process.env.NODE_ENV = 'development'
  
  // Use the proper backend URL from environment variables
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'api.codebuff.dev'
  process.env.NEXT_PUBLIC_BACKEND_URL = backendUrl.startsWith('ws://') || backendUrl.startsWith('wss://')
    ? backendUrl
    : `wss://${backendUrl}`
  
  console.log('Using WebSocket URL:', process.env.NEXT_PUBLIC_BACKEND_URL)
  
  // Ensure we have required environment variables
  if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
    console.error(red('Missing NEXT_PUBLIC_BACKEND_URL environment variable'))
    process.exit(1)
  }

  // Set up authentication and fingerprint
  const fingerprintId = await calculateFingerprint()
  const homeDir = require('os').homedir()
  const storageDir = path.join(homeDir, '.codebuff', 'chats')
  const chatStorage = new ChatStorage(storageDir)

  // Initialize test credentials if needed
  const testCredentials = {
    id: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    authToken: process.env.NEXTAUTH_SECRET || 'test-token',
    fingerprintId,
    fingerprintHash: 'test-hash',
  }

  // Ensure credentials directory exists
  const credentialsDir = path.dirname(CREDENTIALS_PATH)
  if (!fs.existsSync(credentialsDir)) {
    fs.mkdirSync(credentialsDir, { recursive: true })
  }

  // Save test credentials
  fs.writeFileSync(
    CREDENTIALS_PATH,
    JSON.stringify({ default: testCredentials }, null, 2)
  )

  let connectionAttempts = 0
  const MAX_ATTEMPTS = 3
  let testResults: { [key: string]: boolean } = {
    'Terminal Command': false,
    'Web Scraping': false,
    'Code Search': false,
    'Error Handling': false,
    'File Version Tracking': false,
    'File Changes': false,
    'Terminal Command Handler': false,
    'Web Scraping Handler': false,
    'Code Search Handler': false
  }

  const client = new WebSocketClient(() => {
    console.error(yellow('WebSocket connection error'))
    connectionAttempts++
    if (connectionAttempts >= MAX_ATTEMPTS) {
      console.error(red('Max connection attempts reached. Exiting...'))
      process.exit(1)
    }
  })

  // Set up message callback and tool call verification
  let currentTest = ''
  let fileVersions: FileVersion[][] = []
  
  // Set up message callback to verify tool results and responses
  client.setMessageCallback((message: Message | { role: 'system'; content: string }) => {
    console.log(`[${message.role}]: ${message.content}`)
    
    // Track error handling test results
    if (message.role === 'system' && typeof message.content === 'string' && message.content.includes('error')) {
      testResults['Error Handling'] = true
    }

    // Verify tool result markers and responses
    if (typeof message.content === 'string' && message.content.includes(TOOL_RESULT_MARKER)) {
      const content = message.content
      switch (currentTest) {
        case 'terminal':
          testResults['Terminal Command'] = content.includes('Directory listing')
          break
        case 'web':
          testResults['Web Scraping'] = content.includes('Example Domain')
          break
        case 'search':
          testResults['Code Search'] = content.includes('WebSocketClient')
          break
      }
    }
  })
  
  // Set up tool call verification using public subscribe method
  client.subscribe('tool-call', (action: Extract<ServerAction, { type: 'tool-call' }>) => {
    const {
      response,
      data,
      changes,
      changesAlreadyApplied,
      addedFileVersions,
      resetFileVersions,
    } = action

    // Track file versions
    if (addedFileVersions) {
      if (resetFileVersions) {
        fileVersions = [addedFileVersions]
      } else {
        fileVersions.push(addedFileVersions)
      }
      testResults['File Version Tracking'] = true
    }

    // Verify tool handlers
    if (data && data.name) {
      switch (data.name) {
        case 'run_terminal_command':
          testResults['Terminal Command Handler'] = true
          break
        case 'scrape_web_page':
          testResults['Web Scraping Handler'] = true
          break
        case 'code_search':
          testResults['Code Search Handler'] = true
          break
      }
    }

    // Verify changes are applied
    if (changes && changes.length > 0) {
      testResults['File Changes'] = true
    }
  })

  try {
    console.log(yellow('\nConnecting to WebSocket...'))
    await client.connect()
    console.log(green('Connected successfully!'))
    
    // Wait for warm-up
    console.log(yellow('Warming up...'))
    await new Promise(resolve => setTimeout(resolve, 10000))
    console.log(green('Warm-up complete!'))

    // Helper function to wait for test completion
    const waitForTestCompletion = async (testName: string, timeout: number = 15000) => {
      const startTime = Date.now()
      while (Date.now() - startTime < timeout) {
        if (testResults[testName]) {
          console.log(green(`✓ ${testName} test completed successfully`))
          return true
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      console.log(red(`✗ ${testName} test timed out after ${timeout}ms`))
      return false
    }

    // Test terminal command
    console.log(bold('\nTesting tool handlers...'))
    console.log(yellow('\nTesting terminal command...'))
    currentTest = 'terminal'
    await client.sendMessage({
      role: 'user',
      content: 'Run ls command in the current directory'
    })
    await waitForTestCompletion('Terminal Command')

    // Test web scraping
    console.log('\nTesting scrape_web_page...')
    currentTest = 'web'
    await client.sendMessage({
      role: 'user',
      content: 'Scrape the content from https://example.com'
    })
    await waitForTestCompletion('Web Scraping')

    // Test code search
    console.log('\nTesting code_search...')
    currentTest = 'search'
    await client.sendMessage({
      role: 'user',
      content: 'Search for "WebSocketClient" in the codebase'
    })
    await waitForTestCompletion('Code Search')

    // Test file version tracking
    console.log('\nTesting file version tracking...')
    const testFile = path.join(process.cwd(), 'test.txt')
    await client.sendMessage({
      role: 'user',
      content: `Create a new file called test.txt with some content`
    })
    await waitForTestCompletion('File Version Tracking')

    // Test error handling
    console.log('\nTesting error handling...')
    await client.sendMessage({
      role: 'user',
      content: 'Use a non-existent tool'
    })
    await waitForTestCompletion('Error Handling')

    // Verify test results
    const allTestsPassed = Object.values(testResults).every(result => result)
    if (allTestsPassed) {
      console.log(green('\nAll tool call tests completed successfully! ✓'))
      console.log(green('Test Results:'))
      Object.entries(testResults).forEach(([test, passed]) => {
        console.log(green(`  ${passed ? '✓' : '✗'} ${test}`))
      })
    } else {
      console.log(red('\nSome tests failed:'))
      Object.entries(testResults).forEach(([test, passed]) => {
        console.log(passed ? green(`  ✓ ${test}`) : red(`  ✗ ${test}`))
      })
      throw new Error('Some tests failed')
    }
  } catch (error) {
    console.error(red('\nError during tool call tests:'), error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Add test script to package.json scripts
if (require.main === module) {
  testToolCalls().catch(console.error)
}
