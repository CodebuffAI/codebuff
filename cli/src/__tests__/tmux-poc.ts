#!/usr/bin/env bun

/**
 * Proof of Concept: tmux-based CLI testing
 *
 * This script demonstrates how to:
 * 1. Create a tmux session
 * 2. Run the CLI in that session
 * 3. Send commands to the CLI
 * 4. Capture and verify output
 * 5. Clean up the session
 */

import { spawn } from 'child_process'

import stripAnsi from 'strip-ansi'

import { isTmuxAvailable, sleep } from './test-utils'

// Utility to run tmux commands
function tmux(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tmux', args, { stdio: 'pipe' })
    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`tmux command failed: ${stderr}`))
      }
    })
  })
}

// Capture pane content
async function capturePane(sessionName: string): Promise<string> {
  return await tmux(['capture-pane', '-t', sessionName, '-p'])
}

// Main test function
async function testCLIWithTmux() {
  const sessionName = 'codebuff-test-' + Date.now()

  console.log('🚀 Starting tmux-based CLI test...')
  console.log(`📦 Session: ${sessionName}`)

  // 1. Check if tmux is installed
  if (!isTmuxAvailable()) {
    console.error('❌ tmux not found')
    console.error('\n📦 Installation:')
    console.error('  macOS:   brew install tmux')
    console.error('  Ubuntu:  sudo apt-get install tmux')
    console.error('  Windows: Use WSL and run sudo apt-get install tmux')
    console.error(
      '\nℹ️  This is just a proof-of-concept. See the documentation for alternatives.',
    )
    process.exit(1)
  }

  try {
    const version = await tmux(['-V'])
    console.log(`✅ tmux is installed: ${version.trim()}`)

    // 2. Create new detached tmux session running the CLI
    console.log('\n📺 Creating tmux session...')
    await tmux([
      'new-session',
      '-d',
      '-s',
      sessionName,
      '-x',
      '120', // width
      '-y',
      '30', // height
      'bun',
      'run',
      'src/index.tsx',
      '--help',
    ])
    console.log('✅ Session created')

    // 3. Wait for CLI to start
    await sleep(1000)

    // 4. Capture initial output
    console.log('\n📸 Capturing initial output...')
    const initialOutput = await capturePane(sessionName)
    const cleanOutput = stripAnsi(initialOutput)

    console.log('\n--- Output ---')
    console.log(cleanOutput)
    console.log('--- End Output ---\n')

    // 5. Verify output contains expected text
    const checks = [
      { text: '--agent', pass: cleanOutput.includes('--agent') },
      { text: 'Usage:', pass: cleanOutput.includes('Usage:') },
      { text: '--help', pass: cleanOutput.includes('--help') },
    ]

    console.log('🔍 Verification:')
    checks.forEach(({ text, pass }) => {
      console.log(
        `  ${pass ? '✅' : '❌'} Contains "${text}"${pass ? '' : ' - NOT FOUND'}`,
      )
    })

    const allPassed = checks.every((c) => c.pass)
    console.log(
      `\n${allPassed ? '🎉 All checks passed!' : '⚠️  Some checks failed'}`,
    )

    // 6. Example: Send interactive command (commented out for --help test)
    /*
    console.log('\n⌨️  Sending test command...')
    await sendKeys(sessionName, 'hello world')
    await sendKeys(sessionName, 'Enter')
    await sleep(2000)
    
    const responseOutput = await capturePane(sessionName)
    console.log('\n--- Response ---')
    console.log(stripAnsi(responseOutput))
    console.log('--- End Response ---')
    */
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  } finally {
    // 7. Cleanup: kill the tmux session
    console.log('\n🧹 Cleaning up...')
    try {
      await tmux(['kill-session', '-t', sessionName])
      console.log('✅ Session cleaned up')
    } catch (e) {
      console.log('⚠️  Session may have already exited')
    }
  }
}

// Run the test
testCLIWithTmux().catch(console.error)
