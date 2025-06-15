#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const targets = {
  'bun-linux-x64': {
    output: 'codebuff-linux-x64',
    platform: 'linux',
    arch: 'x64',
  },
  'bun-linux-arm64': {
    output: 'codebuff-linux-arm64',
    platform: 'linux',
    arch: 'arm64',
  },
  'bun-darwin-x64': {
    output: 'codebuff-darwin-x64',
    platform: 'darwin',
    arch: 'x64',
  },
  'bun-darwin-arm64': {
    output: 'codebuff-darwin-arm64',
    platform: 'darwin',
    arch: 'arm64',
  },
  'bun-windows-x64': {
    output: 'codebuff-win32-x64.exe',
    platform: 'win32',
    arch: 'x64',
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
  // Fetch external binaries before building
  try {
    execSync('node scripts/fetch-external-binaries.js', { stdio: 'inherit' })
  } catch (error) {
    console.warn('⚠️  Failed to fetch external binaries:', error.message)
  }

  if (buildCurrentOnly) {
    if (!currentPlatformTarget || !targets[currentPlatformTarget]) {
      console.error(`Unsupported platform: ${platformKey}`)
      process.exit(1)
    }

    const targetInfo = targets[currentPlatformTarget]
    const outputName =
      process.platform === 'win32' ? 'codebuff.exe' : 'codebuff'
    await buildTarget(currentPlatformTarget, outputName, targetInfo)
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
      await buildTarget(targetToBuild, outputName, targetInfo)
    } else {
      // Build all targets (default behavior)
      console.log('Building all targets...')
      for (const [target, info] of Object.entries(targets)) {
        await buildTarget(target, info.output, info)
      }
    }
  }
}

async function buildTarget(bunTarget, outputName, targetInfo) {
  // Create bin directory
  const binDir = path.join(__dirname, '..', 'bin')
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  const outputFile = path.join(binDir, outputName)

  console.log(`🔨 Building ${outputName} (${targetInfo.platform}-${targetInfo.arch})...`)

  // Define environment variables, referenced via process.env.KEY in the code.
  // Note: They are inlined as constants in code. So process.env.IS_BINARY is replaced with the value 'true'.
  const flags = {
    PLATFORM: targetInfo.platform,
    ARCH: targetInfo.arch,
    IS_BINARY: 'true',
  }
  const flagsStr = Object.entries(flags)
    .map(
      ([key, value]) =>
        `--define 'process.env.${key}=${typeof value === 'string' ? JSON.stringify(value) : value}'`
    )
    .join(' ')

  const clientEnvVars = await getClientEnvVars()
  Object.assign(process.env, clientEnvVars)

  const envFlag = '--env "NEXT_PUBLIC_*"'

  try {
    const command = [
      'bun build --compile',
      'src/index.ts src/project-context.ts src/checkpoint-worker.ts',
      '--root src',
      `--target=${bunTarget}`,
      flagsStr,
      envFlag,
      `--outfile="${outputFile}"`,
      // '--minify',
    ].join(' ')

    execSync(command, { stdio: 'inherit' })

    // Make executable on Unix systems
    if (!outputName.endsWith('.exe')) {
      fs.chmodSync(outputFile, 0o755)
    }

    console.log(`✅ ${outputName}`)
  } catch (error) {
    console.error(`❌ ${outputName}: ${error.message}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})
