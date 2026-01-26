#!/usr/bin/env bun
/**
 * Build wrapper script that provides detailed logging for build failures.
 *
 * Features:
 * - Captures all build output to build.log for debugging
 * - Filters noisy Contentlayer esbuild warnings from display (but keeps in log)
 * - Shows timing and memory usage
 * - On failure: displays full log for debugging
 * - On success: runs prebuild-agents-cache validation
 */

import { spawn } from 'bun'
import { appendFile, unlink, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const LOG_FILE = path.join(import.meta.dir, '..', 'build.log')

// Pattern to detect Contentlayer esbuild warnings block
const CONTENTLAYER_WARNING_START = /Contentlayer esbuild warnings:/
const CONTENTLAYER_WARNING_END = /^\]/

async function clearLog() {
  if (existsSync(LOG_FILE)) {
    await unlink(LOG_FILE)
  }
}

async function log(message: string) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}\n`
  await appendFile(LOG_FILE, line)
}

async function logRaw(data: string) {
  await appendFile(LOG_FILE, data)
}

function formatMemory(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return `${mb.toFixed(1)}MB`
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`
}

async function runNextBuild(): Promise<number> {
  await log('Starting Next.js build...')
  await log(`Working directory: ${process.cwd()}`)
  await log(`Node version: ${process.version}`)
  await log(`Bun version: ${Bun.version}`)
  await log('---')

  const startTime = Date.now()
  const startMemory = process.memoryUsage().heapUsed

  const proc = spawn(['bun', 'next', 'build'], {
    cwd: path.join(import.meta.dir, '..'),
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      // Force color output for better logs
      FORCE_COLOR: '1',
    },
  })

  // State for filtering Contentlayer warnings
  let inContentlayerWarningBlock = false

  async function processLine(line: string, isStderr: boolean) {
    // Always log everything to the file
    await logRaw(line + '\n')

    // Check if we're entering or exiting the Contentlayer warning block
    if (CONTENTLAYER_WARNING_START.test(line)) {
      inContentlayerWarningBlock = true
      return // Don't print to console
    }

    if (inContentlayerWarningBlock) {
      if (CONTENTLAYER_WARNING_END.test(line)) {
        inContentlayerWarningBlock = false
      }
      return // Don't print to console while in the block
    }

    // Print to console (stderr goes to stderr, stdout to stdout)
    if (isStderr) {
      process.stderr.write(line + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  }

  async function processStream(
    stream: ReadableStream<Uint8Array>,
    isStderr: boolean,
  ) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          await processLine(line, isStderr)
        }
      }

      // Process any remaining content
      if (buffer) {
        await processLine(buffer, isStderr)
      }
    } finally {
      reader.releaseLock()
    }
  }

  // Process both streams concurrently
  await Promise.all([
    processStream(proc.stdout, false),
    processStream(proc.stderr, true),
  ])

  const exitCode = await proc.exited
  const duration = Date.now() - startTime
  const endMemory = process.memoryUsage().heapUsed

  await log('---')
  await log(`Build completed with exit code: ${exitCode}`)
  await log(`Duration: ${formatDuration(duration)}`)
  await log(`Memory used: ${formatMemory(endMemory - startMemory)}`)
  await log(`Peak heap: ${formatMemory(endMemory)}`)

  console.log('')
  console.log(`Build duration: ${formatDuration(duration)}`)
  console.log(`Memory: ${formatMemory(endMemory)}`)

  return exitCode
}

async function runPrebuildAgentsCache(): Promise<number> {
  console.log('')
  console.log('Running prebuild agents cache validation...')
  await log('---')
  await log('Running prebuild-agents-cache.ts...')

  const proc = spawn(['bun', 'run', 'scripts/prebuild-agents-cache.ts'], {
    cwd: path.join(import.meta.dir, '..'),
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited
  await log(`Prebuild agents cache completed with exit code: ${exitCode}`)

  return exitCode
}

async function showBuildLog() {
  console.log('')
  console.log('═'.repeat(60))
  console.log('FULL BUILD LOG (for debugging):')
  console.log('═'.repeat(60))
  console.log('')

  try {
    const logContent = await readFile(LOG_FILE, 'utf-8')
    console.log(logContent)
  } catch (error) {
    console.log('(Could not read build log)')
  }

  console.log('')
  console.log('═'.repeat(60))
  console.log(`Log file saved to: ${LOG_FILE}`)
  console.log('═'.repeat(60))
}

async function main() {
  console.log('Codebuff Web Build')
  console.log('─'.repeat(40))

  await clearLog()
  await log('=== BUILD STARTED ===')
  await log(`Timestamp: ${new Date().toISOString()}`)

  // Run Next.js build
  const buildExitCode = await runNextBuild()

  if (buildExitCode !== 0) {
    console.log('')
    console.log('BUILD FAILED')
    console.log('')

    // Show the full log on failure for debugging
    await showBuildLog()

    process.exit(buildExitCode)
  }

  console.log('')
  console.log('Next.js build succeeded')

  // Run prebuild agents cache
  const cacheExitCode = await runPrebuildAgentsCache()

  if (cacheExitCode !== 0) {
    console.log('')
    console.log('Prebuild agents cache validation failed (non-fatal)')
    // Don't fail the build - prebuild-agents-cache is non-fatal
  }

  await log('=== BUILD COMPLETED ===')

  console.log('')
  console.log('Build completed successfully!')
  console.log(`Build log: ${LOG_FILE}`)

  process.exit(0)
}

main().catch(async (error) => {
  console.error('Build script error:', error)
  await log(`Build script error: ${error}`)
  await showBuildLog()
  process.exit(1)
})
