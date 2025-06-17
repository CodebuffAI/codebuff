#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { patchBunPty } = require('./patch-bun-pty.js')

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

function getBunPtyLibPath(platform, arch) {
  let binaryName
  if (platform === 'darwin') {
    binaryName =
      arch === 'arm64' ? 'librust_pty_arm64.dylib' : 'librust_pty.dylib'
  } else if (platform === 'win32') {
    binaryName = 'rust_pty.dll'
  } else {
    binaryName = arch === 'arm64' ? 'librust_pty_arm64.so' : 'librust_pty.so'
  }

  return path.join(
    __dirname,
    '../../node_modules/bun-pty/rust-pty/target/release',
    binaryName
  )
}

async function main() {
  // Patch bun-pty before building
  console.log('🔧 Patching bun-pty...')
  patchBunPty()

  const targetInfo = getTargetInfo()
  const outputName = currentPlatform === 'win32' ? 'codebuff.exe' : 'codebuff'

  await buildTarget(targetInfo.bunTarget, outputName, targetInfo)
}

async function buildTarget(bunTarget, outputName, targetInfo) {
  // Create bin directory
  const binDir = path.join(__dirname, '..', 'bin')
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  const outputFile = path.join(binDir, outputName)

  console.log(
    `🔨 Building ${outputName} (${targetInfo.platform}-${targetInfo.arch})...`
  )

  // Get binary paths for this target
  const bunPtyLibPath = getBunPtyLibPath(targetInfo.platform, targetInfo.arch)

  // Define environment variables, referenced via process.env.KEY in the code.
  // Note: They are inlined as constants in code. So process.env.IS_BINARY is replaced with the value 'true'.
  const flags = {
    PLATFORM: targetInfo.platform,
    ARCH: targetInfo.arch,
    IS_BINARY: 'true',
    BUN_PTY_LIB: bunPtyLibPath,
  }

  const defineFlags = Object.entries(flags)
    .map(([key, value]) => {
      const stringValue = typeof value === 'string' ? value : String(value)
      return `--define process.env.${key}=${JSON.stringify(stringValue)}`
    })
    .join(' ')

  const command = [
    'bun build --compile',
    'src/index.ts src/workers/project-context.ts src/workers/checkpoint-worker.ts', // Entrypoints
    '--root src',
    `--target=${bunTarget}`,
    `--assets=${bunPtyLibPath}`,
    defineFlags,
    '--env "NEXT_PUBLIC_*"', // Copies all current env vars in process.env to the compiled binary that match the pattern.
    `--outfile=${outputFile}`,
    '--minify',
  ].join(' ')

  try {
    execSync(command, { stdio: 'inherit', shell: true })

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
