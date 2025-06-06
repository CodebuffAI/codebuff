#!/usr/bin/env bun

import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { sleep } from '../../common/src/util/promise' // Corrected import path

const BACKEND_PORT = 3001
const BACKEND_READY_TIMEOUT = 30000 // 30 seconds
const CLI_READY_TIMEOUT = 30000 // 30 seconds
const TASK_COMPLETION_TIMEOUT = 120000 // 2 minutes
const TEST_DIR = 'cat-app-test'
const projectRoot = path.resolve(__dirname, '../..') // Corrected projectRoot definition

interface ProcessInfo {
  process: ChildProcess
  name: string
  output: string[]
}

export interface PromptStep {
  prompt: string
  description?: string
  timeout?: number // Optional custom timeout for this step
}

export class E2ETestRunner {
  private backendProcess: ProcessInfo | null = null
  private cliProcess: ProcessInfo | null = null
  private testDir: string
  private prompts: PromptStep[]

  constructor(prompts: PromptStep[] | string[]) {
    this.testDir = TEST_DIR
    // Convert string array to PromptStep array for backward compatibility
    this.prompts = prompts.map((p) =>
      typeof p === 'string' ? { prompt: p } : p
    )
  }

  private async killProcess(processInfo: ProcessInfo): Promise<void> {
    if (!processInfo.process.pid) return

    return new Promise((resolve) => {
      const { process: proc, name } = processInfo

      // Set up timeout for force kill
      const forceKillTimeout = setTimeout(() => {
        if (proc.pid && !proc.killed) {
          console.log(`Force killing ${name} (PID: ${proc.pid})`)
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
                stdio: 'ignore',
              })
            } else {
              process.kill(-proc.pid, 'SIGKILL')
            }
          } catch (error) {
            // Process might already be dead
          }
        }
        resolve()
      }, 5000)

      proc.on('exit', () => {
        clearTimeout(forceKillTimeout)
        console.log(`${name} process exited`)
        resolve()
      })

      // Try graceful shutdown first
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(proc.pid), '/T'], {
            stdio: 'ignore',
          })
        } else {
          process.kill(-proc.pid!, 'SIGTERM')
        }
      } catch (error) {
        clearTimeout(forceKillTimeout)
        resolve()
      }
    })
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...')

    // Kill processes first
    if (this.cliProcess) {
      await this.killProcess(this.cliProcess)
    }
    if (this.backendProcess) {
      await this.killProcess(this.backendProcess)
    }

    // Remove test directory last
    this.cleanupTestDirectory()
  }

  private async cleanupTestDirectory() {
    console.log('🗑️  Cleaning up test directory...')
    const testPath = path.join(projectRoot, this.testDir)
    try {
      if (fs.existsSync(testPath)) {
        fs.rmSync(testPath, { recursive: true, force: true })
        console.log(`✅ Successfully removed ${testPath}`)
      }
    } catch (error) {
      console.warn(`Warning: Could not remove ${testPath}:`, error)
    }
  }

  private async waitForBackendReady(): Promise<boolean> {
    console.log('⏳ Waiting for backend to be ready...')

    const startTime = Date.now()
    while (Date.now() - startTime < BACKEND_READY_TIMEOUT) {
      try {
        const response = await fetch(`http://localhost:${BACKEND_PORT}/healthz`)
        if (response.ok) {
          console.log('✅ Backend is ready!')
          return true
        }
      } catch (error) {
        // Backend not ready yet, continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    console.error('❌ Backend failed to become ready within timeout')
    return false
  }

  private async waitForCliReady(): Promise<boolean> {
    if (!this.cliProcess) return false

    console.log('⏳ Waiting for CLI to be ready...')

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error('❌ CLI failed to become ready within timeout')
        resolve(false)
      }, CLI_READY_TIMEOUT)

      const checkOutput = () => {
        const output = this.cliProcess!.output.join('')
        if (output.includes('Codebuff')) {
          clearTimeout(timeout)
          console.log('✅ CLI is ready!')
          return true
        }
        return false
      }

      // Set up a simple interval to check for readiness without interfering with main output capture
      const checkInterval = setInterval(() => {
        const ready = checkOutput()
        if (ready) {
          clearInterval(checkInterval)
          resolve(true)
        }
      }, 100)

      // Clean up interval when timeout occurs
      setTimeout(() => {
        clearInterval(checkInterval)
      }, CLI_READY_TIMEOUT)
    })
  }

  private async startBackend(): Promise<boolean> {
    console.log('🚀 Starting backend server using package.json script...')

    const backendProcess = spawn('bun', ['run', 'start-server'], {
      cwd: projectRoot, // Run from actual project root, not evals directory
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'development',
        // Set environment to local to avoid production database requirements
        NEXT_PUBLIC_CB_ENVIRONMENT: 'local',
        // Disable BigQuery for testing
        DISABLE_BIGQUERY: 'true',
      },
    })

    this.backendProcess = {
      process: backendProcess,
      name: 'Backend',
      output: [],
    }

    // Capture output and optionally stream it for debugging
    backendProcess.stdout?.on('data', (data) => {
      const text = data.toString()
      this.backendProcess!.output.push(text)
      if (process.env.DEBUG_EVAL) {
        console.log(`[Backend] ${text.trim()}`)
      }
    })

    backendProcess.stderr?.on('data', (data) => {
      const text = data.toString()
      this.backendProcess!.output.push(text)
      if (process.env.DEBUG_EVAL) {
        console.error(`[Backend Error] ${text.trim()}`)
      }
    })

    backendProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`)
      if (code !== 0) {
        console.log('Backend output:', this.backendProcess?.output.join(''))
      }
    })

    // Wait for backend to be ready
    return await this.waitForBackendReady()
  }

  private async startCli(): Promise<boolean> {
    console.log('🤖 Starting CLI using package.json script...')

    const cliProcess = spawn('bun', ['run', 'start-client'], {
      cwd: projectRoot, // Corrected: Run from actual project root
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CODEBUFF_BACKEND_URL: `http://localhost:${BACKEND_PORT}`,
      },
    })

    this.cliProcess = {
      process: cliProcess,
      name: 'CLI',
      output: [],
    }

    // Set up persistent output capture that will continue throughout the entire process
    const stdoutHandler = (data: Buffer) => {
      const text = data.toString()
      this.cliProcess!.output.push(text)
      // Always show CLI output for debugging
      process.stdout.write(`${text}`)
    }

    const stderrHandler = (data: Buffer) => {
      const text = data.toString()
      this.cliProcess!.output.push(text)
      // Always show CLI errors for debugging
      process.stderr.write(`[CLI ERROR]${text}`)
    }

    cliProcess.stdout?.on('data', stdoutHandler)
    cliProcess.stderr?.on('data', stderrHandler)

    cliProcess.on('exit', (code) => {
      console.log(`CLI process exited with code ${code}`)
    })

    // Wait for CLI to be ready
    return await this.waitForCliReady()
  }

  private async sendPromptToCli(
    promptStep: PromptStep,
    stepNumber: number
  ): Promise<boolean> {
    if (!this.cliProcess?.process.stdin) {
      console.error('❌ CLI stdin not available')
      return false
    }

    const description = promptStep.description || `Step ${stepNumber}`
    console.log(`📝 ${description}: Sending prompt to CLI...`)
    console.log(`   Prompt: "${promptStep.prompt}"`)

    try {
      this.cliProcess.process.stdin.write(promptStep.prompt)
      await sleep(50)
      this.cliProcess.process.stdin.write('\r')
      console.log(`✅ Prompt sent to CLI`)
      return true
    } catch (error) {
      console.error('❌ Failed to send prompt to CLI:', error)
      return false
    }
  }

  private async waitForTaskCompletion(
    promptStep: PromptStep,
    stepNumber: number
  ): Promise<boolean> {
    const description = promptStep.description || `Step ${stepNumber}`
    const timeout = promptStep.timeout || TASK_COMPLETION_TIMEOUT

    console.log(`⏳ ${description}: Waiting for task completion...`)

    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        console.log(`⏰ ${description}: Task completion timeout reached`)
        console.log('\n📄 CLI Output at timeout (last 3000 chars):')
        if (this.cliProcess) {
          const output = this.cliProcess.output.join('')
          console.log(output.slice(-3000))
        }
        resolve(true) // Continue to next step even if timeout
      }, timeout)

      let lastOutputLength = 0
      const checkCompletion = () => {
        if (!this.cliProcess) return

        const output = this.cliProcess.output.join('')

        // Only check for completion if we have new output since last check
        if (output.length > lastOutputLength) {
          lastOutputLength = output.length

          // Look for completion indicators - be more specific to avoid false positives
          const recentOutput = output.slice(-1000) // Check recent output

          // Look for the specific completion pattern: "Complete!" or "Type "diff""
          if (
            recentOutput.includes('Complete!') &&
            recentOutput.includes('Type "diff"')
          ) {
            clearTimeout(timeoutHandle)
            console.log(`✅ ${description}: Task appears to be complete!`)
            resolve(true)
          }
        }
      }

      // Check existing output first
      checkCompletion()

      // Set up a simple interval to check for completion
      const checkInterval = setInterval(() => {
        checkCompletion()
      }, 1000) // Check every second

      // Clean up interval when timeout occurs
      setTimeout(() => {
        clearInterval(checkInterval)
      }, timeout)
    })
  }

  private verifyResult(): { success: boolean; details: string } {
    console.log('🔍 Verifying results...')
    const testPath = path.join(projectRoot, this.testDir)

    // Check if test directory was created
    if (!fs.existsSync(testPath)) {
      return {
        success: false,
        details: `Test directory ${this.testDir} was not created`,
      }
    }

    // Look for files containing CODEBUFF_IS_WORKING
    const foundFiles: string[] = []

    const searchDirectory = (dir: string) => {
      try {
        const items = fs.readdirSync(dir)
        for (const item of items) {
          const fullPath = path.join(dir, item)
          const stat = fs.statSync(fullPath)

          if (stat.isDirectory()) {
            searchDirectory(fullPath)
          } else {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8')
              if (content.includes('CODEBUFF_IS_WORKING')) {
                foundFiles.push(fullPath)
              }
            } catch (error) {
              // Ignore files that can't be read as text
            }
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not search directory ${dir}:`, error)
      }
    }

    searchDirectory(testPath)

    if (foundFiles.length > 0) {
      return {
        success: true,
        details: `Found CODEBUFF_IS_WORKING in files: ${foundFiles.join(', ')}`,
      }
    } else {
      return {
        success: false,
        details: `CODEBUFF_IS_WORKING string not found in any files in ${this.testDir}`,
      }
    }
  }

  async run(): Promise<boolean> {
    const startTime = Date.now()

    try {
      console.log('🐱 Starting Manager E2E Cat App Eval...')
      console.log(`📋 Will execute ${this.prompts.length} prompt steps`)

      // Only cleanup test directory, not processes
      this.cleanupTestDirectory()

      // Start backend
      if (!(await this.startBackend())) {
        console.log('\n📄 Backend Output for debugging:')
        if (this.backendProcess) {
          const output = this.backendProcess.output.join('')
          console.log(output)
        }
        throw new Error('Failed to start backend')
      }

      // Start CLI
      if (!(await this.startCli())) {
        throw new Error('Failed to start CLI')
      }

      // Execute each prompt step sequentially
      for (let i = 0; i < this.prompts.length; i++) {
        const promptStep = this.prompts[i]
        const stepNumber = i + 1

        console.log(`\n🔄 === Step ${stepNumber}/${this.prompts.length} ===`)

        // Check if CLI process is still alive before sending prompt
        if (!this.cliProcess?.process.pid || this.cliProcess.process.killed) {
          throw new Error(`CLI process died before step ${stepNumber}`)
        }

        // Send prompt
        if (!(await this.sendPromptToCli(promptStep, stepNumber))) {
          throw new Error(`Failed to send prompt for step ${stepNumber}`)
        }

        // Wait for completion
        await this.waitForTaskCompletion(promptStep, stepNumber)

        console.log(`✅ Step ${stepNumber} completed`)

        // Add a small delay between prompts to ensure the CLI is ready for the next one
        await sleep(1000)
      }

      // Verify results
      const verification = this.verifyResult()

      const duration = Date.now() - startTime

      console.log('\n📋 E2E Eval Results:')
      console.log(`⏱️  Duration: ${duration}ms`)
      console.log(`✅ Backend started: Yes`)
      console.log(`✅ CLI started: Yes`)
      console.log(`✅ Prompts executed: ${this.prompts.length}`)
      console.log(`🔍 Verification: ${verification.success ? '✅' : '❌'}`)
      console.log(`📝 Details: ${verification.details}`)

      // Clean up test directory after verification
      this.cleanupTestDirectory()

      if (verification.success) {
        console.log('\n🎉 SUCCESS: E2E test passed!')
        return true
      } else {
        console.log('\n❌ FAILURE: E2E test failed')

        // Print CLI output for debugging
        if (this.cliProcess) {
          console.log('\n📄 CLI Output (last 2000 chars):')
          const output = this.cliProcess.output.join('')
          console.log(output.slice(-2000))
        }

        return false
      }
    } catch (error) {
      console.error('❌ E2E test failed with error:', error)

      // Print process outputs for debugging
      if (this.backendProcess) {
        console.log('\n📄 Backend Output (last 1000 chars):')
        const output = this.backendProcess.output.join('')
        console.log(output.slice(-1000))
      }

      if (this.cliProcess) {
        console.log('\n📄 CLI Output (last 1000 chars):')
        const output = this.cliProcess.output.join('')
        console.log(output.slice(-1000))
      }

      return false
    } finally {
      await this.cleanup()
    }
  }
}

// Example usage with multiple prompts
const examplePrompts: PromptStep[] = [
  {
    prompt: `Build a quick node console app about cats in a new root directory, ${TEST_DIR}. Also: add the string CODEBUFF_IS_WORKING in a comment in some file.`,
    description: 'Create cat app with CODEBUFF_IS_WORKING comment',
    timeout: 180_000, // 3 minutes for this step
  },
]

// Run the eval if this script is executed directly
if (require.main === module) {
  const prompts = examplePrompts

  const runner = new E2ETestRunner(prompts)
  runner
    .run()
    .then((success) => {
      process.exit(success ? 0 : 1)
    })
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}
