#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const targets = {
  'bun-linux-x64': {
    output: 'codebuff-linux-x64',
    triplet: 'x86_64-unknown-linux-gnu',
  },
  'bun-linux-arm64': {
    output: 'codebuff-linux-arm64',
    triplet: 'aarch64-unknown-linux-gnu',
  },
  'bun-darwin-x64': {
    output: 'codebuff-darwin-x64',
    triplet: 'x86_64-apple-darwin',
  },
  'bun-darwin-arm64': {
    output: 'codebuff-darwin-arm64',
    triplet: 'aarch64-apple-darwin',
  },
  'bun-windows-x64': {
    output: 'codebuff-win32-x64.exe',
    triplet: 'x86_64-pc-windows-msvc',
  },
}

// Check if --current flag is passed
const buildCurrentOnly = process.argv.includes('--current')

// Get current platform info
const platformKey = `${process.platform}-${process.arch}`
const currentPlatformTarget = {
  'linux-x64': 'bun-linux-x64',
  'linux-arm64': 'bun-linux-arm64',
  'darwin-x64': 'bun-darwin-x64',
  'darwin-arm64': 'bun-darwin-arm64',
  'win32-x64': 'bun-windows-x64',
}[platformKey]

async function getClientEnvVars() {
  // Import the env module from the project root
  const envModule = await import(path.resolve(__dirname, '../../env.ts'))
  const env = envModule.env

  // Extract all client environment variable keys
  const clientEnvKeys = Object.keys(env).filter((key) =>
    key.startsWith('NEXT_PUBLIC_')
  )

  return Object.fromEntries(clientEnvKeys.map((key) => [key, env[key]]))
}

async function main() {
  if (buildCurrentOnly) {
    if (!currentPlatformTarget || !targets[currentPlatformTarget]) {
      console.error(`Unsupported platform: ${platformKey}`)
      process.exit(1)
    }

    const targetInfo = targets[currentPlatformTarget]
    const outputName =
      process.platform === 'win32' ? 'codebuff.exe' : 'codebuff'
    await buildTarget(currentPlatformTarget, outputName, targetInfo.triplet)
  } else {
    // Check for CI environment variables (for backwards compatibility)
    const targetToBuild = process.env.BUN_TARGET
    const outputName = process.env.OUTPUT_NAME

    if (targetToBuild && outputName) {
      // Build single target (for CI)
      const targetInfo = targets[targetToBuild]
      if (!targetInfo) {
        console.error(`Unknown target: ${targetToBuild}`)
        process.exit(1)
      }
      await buildTarget(targetToBuild, outputName, targetInfo.triplet)
    } else {
      // Build all targets (default behavior)
      console.log('Building all targets...')
      for (const [target, info] of Object.entries(targets)) {
        await buildTarget(target, info.output, info.triplet)
      }
    }
  }
}

async function buildTarget(bunTarget, outputName, triplet) {
  // Create bin directory
  const binDir = path.join(__dirname, '..', 'bin')
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  const outputFile = path.join(binDir, outputName)

  console.log(`Building ${bunTarget} -> ${outputName} (${triplet})...`)

  const clientEnvVars = await getClientEnvVars()
  Object.assign(process.env, clientEnvVars)

  const envFlag = '--env "NEXT_PUBLIC_*"'

  // Build define flags for environment variables
  const defineFlags = [`--define:PLATFORM_TRIPLET='"${triplet}"'`]

  try {
    const command = `bun build --compile src/index.ts src/project-context.ts src/checkpoint-worker.ts --target=${bunTarget} ${defineFlags.join(' ')} ${envFlag} --outfile="${outputFile}"` // --minify

    execSync(command, { stdio: 'inherit' })

    // Make executable on Unix systems
    if (!outputName.endsWith('.exe')) {
      fs.chmodSync(outputFile, 0o755)
    }

    console.log(`✅ Built: ${outputFile}`)
    console.log(`Injected ${defineFlags.length - 1} environment variables`)
  } catch (error) {
    console.error(`❌ Failed to build ${bunTarget}:`, error.message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})
