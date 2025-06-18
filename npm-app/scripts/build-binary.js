#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { patchBunPty } = require('./patch-bun-pty.js')

// Configuration
const VERBOSE = process.env.VERBOSE === 'true' || false

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

function copyPackageToLocal(packageName) {
  const rootNodeModules = path.join(
    __dirname,
    '../../node_modules',
    packageName
  )
  const localNodeModules = path.join(__dirname, '../node_modules', packageName)

  if (!fs.existsSync(rootNodeModules)) {
    if (VERBOSE) {
      console.warn(`⚠️  Package ${packageName} not found in root node_modules`)
    }
    return false
  }

  // Create local node_modules directory if it doesn't exist
  const localNodeModulesDir = path.dirname(localNodeModules)
  if (!fs.existsSync(localNodeModulesDir)) {
    fs.mkdirSync(localNodeModulesDir, { recursive: true })
  }

  // Remove existing local package if it exists
  if (fs.existsSync(localNodeModules)) {
    fs.rmSync(localNodeModules, { recursive: true, force: true })
  }

  // Copy the package
  fs.cpSync(rootNodeModules, localNodeModules, { recursive: true })
  log(`📦 Copied ${packageName} to local node_modules`)
  return true
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

  const libPath = path.join(
    __dirname,
    '../node_modules/bun-pty/rust-pty/target/release',
    binaryName
  )

  if (!fs.existsSync(libPath)) {
    if (VERBOSE) {
      console.error(`⚠️  Bun pty lib not found: ${libPath}`)
    }
    return null
  }

  return libPath
}

function getTreeSitterWasmPath() {
  const wasmPath = path.join(
    __dirname,
    '../node_modules/web-tree-sitter/tree-sitter.wasm'
  )

  if (!fs.existsSync(wasmPath)) {
    if (VERBOSE) {
      console.error(`⚠️  Web tree sitter wasm not found: ${wasmPath}`)
    }
    return null
  }

  return wasmPath
}

function getVSCodeTreeSitterWasmPaths() {
  const wasmDir = path.join(
    __dirname,
    '../node_modules/@vscode/tree-sitter-wasm/wasm'
  )

  if (!fs.existsSync(wasmDir)) {
    if (VERBOSE) {
      console.error(`⚠️  VS Code tree sitter wasm dir not found: ${wasmDir}`)
    }
    return []
  }

  return fs
    .readdirSync(wasmDir)
    .filter((file) => file.endsWith('.wasm'))
    .map((file) => path.join(wasmDir, file))
    .filter((filePath) => fs.existsSync(filePath))
}

async function main() {
  log('🔧 Patching bun-pty...')
  patchBunPty(VERBOSE)

  // Copy required packages to local node_modules
  log('📦 Copying required packages to local node_modules...')
  copyPackageToLocal('bun-pty')
  copyPackageToLocal('web-tree-sitter')
  copyPackageToLocal('@vscode/tree-sitter-wasm')

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

  log(
    `🔨 Building ${outputName} (${targetInfo.platform}-${targetInfo.arch})...`
  )

  // Get all asset paths (now from local node_modules)
  const bunPtyLibPath = getBunPtyLibPath(targetInfo.platform, targetInfo.arch)
  const treeSitterWasmPath = getTreeSitterWasmPath()
  const vsCodeWasmPaths = getVSCodeTreeSitterWasmPaths()

  // Build assets array declaratively, filtering out null values
  const assets = [bunPtyLibPath, treeSitterWasmPath, ...vsCodeWasmPaths].filter(
    Boolean
  )

  log(`📦 Bundling assets: ${assets.join(', ')}`)

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

  const assetsFlag = assets.length > 0 ? `--assets=${assets.join(',')}` : ''

  const command = [
    'bun build --compile',
    'src/index.ts src/workers/project-context.ts src/workers/checkpoint-worker.ts', // Entrypoints
    '--root src',
    `--target=${bunTarget}`,
    assetsFlag,
    defineFlags,
    '--env "NEXT_PUBLIC_*"', // Copies all current env vars in process.env to the compiled binary that match the pattern.
    `--outfile=${outputFile}`,
    '--minify',
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

    logAlways(`✅ Built ${outputName}`)
  } catch (error) {
    logAlways(`❌ Failed to build ${outputName}: ${error.message}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Build failed:', error)
  process.exit(1)
})
