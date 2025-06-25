#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { patchBunPty } = require('./patch-bun-pty.js')
const { patchWebTreeSitter } = require('./patch-web-tree-sitter.js')

// Configuration
const VERBOSE = process.env.VERBOSE === 'true'

// Get package name from command line argument or environment variable
const packageName = process.argv[2] || process.env.PACKAGE_NAME || 'codebuff'

// Logging helper
function log(message) {
  if (VERBOSE) {
    console.log(message)
  }
}

function logAlways(message) {
  console.log(message)
}

// Get current platform info
const currentPlatform = process.platform
const currentArch = process.arch

// Map current platform/arch to target info
const getTargetInfo = () => {
  // Check for environment variable overrides (for cross-compilation)
  if (
    process.env.OVERRIDE_TARGET &&
    process.env.OVERRIDE_PLATFORM &&
    process.env.OVERRIDE_ARCH
  ) {
    return {
      bunTarget: process.env.OVERRIDE_TARGET,
      platform: process.env.OVERRIDE_PLATFORM,
      arch: process.env.OVERRIDE_ARCH,
    }
  }

  const platformKey = `${currentPlatform}-${currentArch}`

  const targetMap = {
    'linux-x64': { bunTarget: 'bun-linux-x64', platform: 'linux', arch: 'x64' },
    'linux-arm64': {
      bunTarget: 'bun-linux-arm64',
      platform: 'linux',
      arch: 'arm64',
    },
    'darwin-x64': {
      bunTarget: 'bun-darwin-x64',
      platform: 'darwin',
      arch: 'x64',
    },
    'darwin-arm64': {
      bunTarget: 'bun-darwin-arm64',
      platform: 'darwin',
      arch: 'arm64',
    },
    'win32-x64': {
      bunTarget: 'bun-windows-x64',
      platform: 'win32',
      arch: 'x64',
    },
  }

  const targetInfo = targetMap[platformKey]
  if (!targetInfo) {
    console.error(`Unsupported platform: ${platformKey}`)
    process.exit(1)
  }

  return targetInfo
}

async function main() {
  log('🔧 Patching bun-pty...')
  patchBunPty(VERBOSE)

  log('🔧 Patching web-tree-sitter...')
  patchWebTreeSitter(VERBOSE)

  const targetInfo = getTargetInfo()
  const outputName =
    currentPlatform === 'win32' ? `${packageName}.exe` : packageName

  await buildTarget(targetInfo.bunTarget, outputName, targetInfo)
}

async function buildTarget(bunTarget, outputName, targetInfo) {
  // Create bin directory
  const binDir = path.join(__dirname, '..', 'bin')
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  const outputFile = path.join(binDir, outputName)

  log(
    `🔨 Building ${outputName} (${targetInfo.platform}-${targetInfo.arch})...`
  )

  const flags = {
    IS_BINARY: 'true',
  }

  const defineFlags = Object.entries(flags)
    .map(([key, value]) => {
      const stringValue =
        typeof value === 'string' ? `'${value}'` : String(value)
      return `--define process.env.${key}=${JSON.stringify(stringValue)}`
    })
    .join(' ')

  const entrypoints = [
    'src/index.ts',
    'src/workers/project-context.ts',
    'src/workers/checkpoint-worker.ts',
  ]

  const command = [
    'bun build --compile',
    ...entrypoints,
    `--target=${bunTarget}`,
    '--asset-naming=[name].[ext]',
    defineFlags,
    '--env "NEXT_PUBLIC_*"', // Copies all current env vars in process.env to the compiled binary that match the pattern.
    `--outfile=${outputFile}`,
    // '--minify', // harder to debug
  ]
    .filter(Boolean)
    .join(' ')

  try {
    const stdio = VERBOSE ? 'inherit' : 'pipe'
    execSync(command, { stdio, shell: true })

    // Make executable on Unix systems
    if (!outputName.endsWith('.exe')) {
      fs.chmodSync(outputFile, 0o755)
    }

    logAlways(
      `✅ Built ${outputName} for ${targetInfo.platform}-${targetInfo.arch}`
    )
  } catch (error) {
    logAlways(`❌ Failed to build ${outputName}: ${error.message}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})
