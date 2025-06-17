#!/usr/bin/env bun

import { spawn } from 'child_process'

// Package configurations
const packages = [
  { name: 'common', cwd: 'common' },
  { name: 'backend', cwd: 'backend' },
  { name: 'web', cwd: 'web' },
  { name: 'npm-app', cwd: 'npm-app' },
  { name: 'evals', cwd: 'evals' },
  { name: 'scripts', cwd: 'scripts' },
  { name: 'billing', cwd: 'packages/billing' },
  { name: 'bigquery', cwd: 'packages/bigquery' },
  { name: 'internal', cwd: 'packages/internal' },
  { name: 'code-map', cwd: 'packages/code-map' },
]

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`
}

function runTypecheck(pkg: {
  name: string
  cwd: string
}): Promise<{ name: string; success: boolean; output: string }> {
  return new Promise((resolve) => {
    // Run from project root, using --cwd to specify package directory
    const projectRoot = process.cwd().endsWith('/scripts') ? '..' : '.'
    const child = spawn('bun', ['run', '--cwd', pkg.cwd, 'typecheck'], {
      cwd: projectRoot,
      stdio: 'pipe',
    })

    let output = ''
    let errorOutput = ''

    child.stdout?.on('data', (data) => {
      output += data.toString()
    })

    child.stderr?.on('data', (data) => {
      errorOutput += data.toString()
    })

    child.on('close', (code) => {
      const allOutput = (output + errorOutput).trim()
      resolve({
        name: pkg.name,
        success: code === 0,
        output: allOutput,
      })
    })

    child.on('error', (error) => {
      resolve({
        name: pkg.name,
        success: false,
        output: `Error running typecheck: ${error.message}`,
      })
    })
  })
}

async function main() {
  console.log(colorize('🔍 Running typecheck for all packages...', 'bright'))
  console.log()

  const startTime = Date.now()

  // Run all typechecks in parallel
  const promises = packages.map(runTypecheck)
  const results = await Promise.all(promises)

  // Display results
  let hasErrors = false

  for (const result of results) {
    const prefix = colorize(
      `[${result.name}]`,
      result.success ? 'green' : 'red'
    )

    if (result.success) {
      if (result.output) {
        // Show any output even for successful runs
        console.log(`${prefix} ${colorize('✓', 'green')}`)
        result.output.split('\n').forEach((line) => {
          if (line.trim()) {
            console.log(`${colorize(`[${result.name}]`, 'gray')} ${line}`)
          }
        })
      } else {
        console.log(`${prefix} ${colorize('✓ No errors', 'green')}`)
      }
    } else {
      hasErrors = true
      console.log(`${prefix} ${colorize('✗ Type errors found:', 'red')}`)
      result.output.split('\n').forEach((line) => {
        if (line.trim()) {
          console.log(`${colorize(`[${result.name}]`, 'red')} ${line}`)
        }
      })
    }
    console.log()
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  const successCount = results.filter((r) => r.success).length
  const totalCount = results.length

  console.log(colorize('─'.repeat(50), 'gray'))

  if (hasErrors) {
    console.log(colorize(`✗ Typecheck completed in ${duration}s`, 'red'))
    console.log(
      colorize(`${successCount}/${totalCount} packages passed`, 'red')
    )
    process.exit(1)
  } else {
    console.log(
      colorize(`✓ All packages passed typecheck in ${duration}s`, 'green')
    )
    console.log(
      colorize(`${successCount}/${totalCount} packages passed`, 'green')
    )
  }
}

main().catch((error) => {
  console.error(colorize('Fatal error:', 'red'), error)
  process.exit(1)
})
