import { jest } from '@jest/globals'
import { spawn, ChildProcess } from 'child_process'
import { CodebuffClient } from '../client'
import { getInitialAgentState } from 'common/types/agent-state'
import path from 'path'
import fs from 'fs'

jest.setTimeout(60000) // 60 seconds for all tests and hooks by default

describe('E2E Test', () => {
  let backendProcess: ChildProcess
  let client: CodebuffClient
  const TEST_PORT = 3001
  const TEST_WS_URL = `ws://localhost:${TEST_PORT}/ws`
  const envTestPath = path.resolve(__dirname, '../../../.env.test')

  beforeAll(async () => {
    // Create empty .env.test file to prevent dotenv from erroring
    fs.writeFileSync(envTestPath, '')

    // Start backend server
    const backendDir = path.resolve(__dirname, '../../../backend')
    console.log('Starting backend server in directory:', backendDir)
    
    backendProcess = spawn('bun', ['run', 'dev'], {
      env: {
        ...process.env,
        PORT: TEST_PORT.toString(),
        NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
        GOOGLE_CLOUD_PROJECT_ID: 'test-project',
        HELICONE_API_KEY: 'pk-helicone-test-key',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
        ANTHROPIC_API_KEY2: 'sk-ant-test-key2',
        GEMINI_API_KEY: 'AIzatest',
        OPEN_AI_KEY: 'sk-proj-test-key',
        DEEPSEEK_API_KEY: 'sk-test-key',
        OPEN_ROUTER_API_KEY: 'sk-or-v1-test-key',
        RELACE_API_KEY: 'rlc-test-key',
        STRIPE_SECRET_KEY: 'sk_test_key',
        STRIPE_WEBHOOK_SECRET_KEY: 'whsec_test_key',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        NEXTAUTH_SECRET: 'test-secret',
        NEXT_PUBLIC_SUPPORT_EMAIL: 'test@example.com',
        NEXT_PUBLIC_POSTHOG_API_KEY: 'phc_test',
        NEXT_PUBLIC_POSTHOG_HOST_URL: 'http://localhost:3000',
        // New required variables from common/src/env.mjs
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        STRIPE_USAGE_PRICE_ID: 'price_test1234567890abcdef',
        API_KEY_ENCRYPTION_SECRET: '12345678901234567890123456789012', // 32 chars
      },
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'], // Explicitly set stdio
    })

    // Accumulate stdout to handle split chunks
    let stdoutAccumulator = ''
    let stderrAccumulator = ''

    // Log server output for debugging
    backendProcess.stdout?.on('data', (data) => {
      const chunk = data.toString()
      stdoutAccumulator += chunk
      console.log('Backend stdout:', chunk)
    })
    backendProcess.stderr?.on('data', (data) => {
      const chunk = data.toString()
      stderrAccumulator += chunk
      console.error('Backend stderr:', chunk)
    })

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('Accumulated stdout:', stdoutAccumulator)
        console.error('Accumulated stderr:', stderrAccumulator)
        reject(new Error('Backend server failed to start within 45 seconds'))
      }, 45000) // Increased from 30s to 45s

      const checkStarted = () => {
        if (stdoutAccumulator.includes('Server is running on port') &&
            stdoutAccumulator.includes('Web socket server listening on /ws')) {
          clearTimeout(timeout)
          resolve()
        }
      }

      // Check both on new data and immediately
      backendProcess.stdout?.on('data', checkStarted)
      checkStarted() // Check if messages are already in accumulator

      // Also reject if process exits
      backendProcess.on('exit', (code) => {
        clearTimeout(timeout)
        console.error('Backend process exited prematurely')
        console.error('Last stdout:', stdoutAccumulator)
        console.error('Last stderr:', stderrAccumulator)
        reject(new Error(`Backend process exited with code ${code}`))
      })
    })

    console.log('Backend server started successfully')
  })

  afterAll(async () => {
    console.log('Cleaning up backend server')
    if (backendProcess) {
      // Send SIGTERM first for graceful shutdown
      backendProcess.kill('SIGTERM')
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        const forceKillTimeout = setTimeout(() => {
          console.log('Force killing backend process')
          backendProcess.kill('SIGKILL')
          resolve()
        }, 5000)

        backendProcess.on('exit', () => {
          clearTimeout(forceKillTimeout)
          resolve()
        })
      })
    }

    // Remove test env file
    try {
      fs.unlinkSync(envTestPath)
    } catch (error) {
      console.error('Error removing .env.test:', error)
    }
  })

  beforeEach(async () => {
    console.log('Creating and connecting client')
    // Create client instance
    client = new CodebuffClient({
      websocketUrl: TEST_WS_URL,
      projectRoot: process.cwd(),
      retry: {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
      },
    })

    try {
      // Connect client
      await client.connect()
      console.log('Client connected successfully')
    } catch (error) {
      console.error('Failed to connect client:', error)
      throw error
    }
  })

  afterEach(async () => {
    console.log('Disconnecting client')
    if (client) {
      try {
        await client.disconnect()
        console.log('Client disconnected successfully')
      } catch (error) {
        console.error('Error disconnecting client:', error)
      }
    }
  })

  it('should receive a response from the backend', async () => {
    // Create initial agent state
    const agentState = getInitialAgentState({
      projectRoot: process.cwd(),
      files: {},
      gitStatus: '',
      gitDiff: '',
      gitDiffCached: '',
      gitCommitMessages: [],
      recentlyReadFiles: [],
      systemInfo: {
        os: 'test',
        shell: 'test',
        shellConfigFiles: {},
      },
    })

    console.log('Sending prompt to backend')
    // Send a simple prompt
    const promptStream = await client.sendPrompt({
      prompt: 'Hello, how are you?',
      agentState,
    })

    // Collect all events
    const events: any[] = []
    for await (const event of promptStream) {
      events.push(event)
      if (event.type === 'text') {
        console.log('Received text event:', event.content)
      }
    }

    // Verify we got a response
    expect(events.length).toBeGreaterThan(0)
    
    // Find text events
    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    
    // The response should be friendly and mention being Buffy
    const fullResponse = textEvents.map(e => e.content).join('')
    expect(fullResponse).toContain('Buffy')
  })
})