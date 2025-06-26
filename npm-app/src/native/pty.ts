import path from 'path'
import { mkdirSync } from 'fs'
import { spawnSync } from 'bun'

import { CONFIG_DIR } from '../credentials'
import { logger } from '../utils/logger'

// Native library imports - these are bundled as file assets
// @ts-ignore
import darwinArm from 'bun-pty/rust-pty/target/release/librust_pty_arm64.dylib' with { type: 'file' }
// @ts-ignore
import darwinX64 from 'bun-pty/rust-pty/target/release/librust_pty.dylib' with { type: 'file' }
// @ts-ignore
import linuxArm from 'bun-pty/rust-pty/target/release/librust_pty_arm64.so' with { type: 'file' }
// @ts-ignore
import linuxX64 from 'bun-pty/rust-pty/target/release/librust_pty.so' with { type: 'file' }
// @ts-ignore
import winX64 from 'bun-pty/rust-pty/target/release/rust_pty.dll' with { type: 'file' }

type BunPty = typeof import('bun-pty')

// State management for lazy loading
let bunPtyModule: BunPty | undefined = undefined

/**
 * Get the native library path for the current platform
 */
function getBunLibraryPath(): string | undefined {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin' && arch === 'arm64') {
    return darwinArm
  } else if (platform === 'darwin' && arch === 'x64') {
    return darwinX64
  } else if (platform === 'linux' && arch === 'arm64') {
    return linuxArm
  } else if (platform === 'linux' && arch === 'x64') {
    return linuxX64
  } else if (platform === 'win32' && arch === 'x64') {
    return winX64
  }

  logger.warn(
    { platform, arch },
    'Unsupported platform/architecture combination for bun-pty'
  )
  return undefined
}

/**
 * Extract the PTY library to the same directory as the codebuff executable
 *
 * NOTE: Open bug in loading a rust binary forces us to go this route: https://github.com/oven-sh/bun/issues/11598
 */
const getPtyLibraryPath = async (): Promise<string | undefined> => {
  // In dev mode, use the embedded library path directly
  if (!process.env.IS_BINARY) {
    return getBunLibraryPath()
  }

  // Compiled mode - self-extract the embedded binary to cache directory
  const platform = process.platform
  const arch = process.arch

  let libFileName: string
  if (platform === 'darwin' && arch === 'arm64') {
    libFileName = 'bun-pty.dylib'
  } else if (platform === 'darwin' && arch === 'x64') {
    libFileName = 'bun-pty.dylib'
  } else if (platform === 'linux' && arch === 'arm64') {
    libFileName = 'bun-pty.so'
  } else if (platform === 'linux' && arch === 'x64') {
    libFileName = 'bun-pty.so'
  } else if (platform === 'win32' && arch === 'x64') {
    libFileName = 'bun-pty.dll'
  } else {
    logger.warn(
      { platform, arch },
      'Unsupported platform/architecture combination for bun-pty'
    )
    return undefined
  }

  const outPath = path.join(CONFIG_DIR, libFileName)

  // Check if already extracted
  if (await Bun.file(outPath).exists()) {
    return outPath
  }

  // Extract the embedded binary
  try {
    const embeddedLibPath = getBunLibraryPath()
    if (!embeddedLibPath) {
      return undefined
    }

    // Create cache directory
    mkdirSync(path.dirname(outPath), { recursive: true })

    // Copy embedded binary to cache location
    await Bun.write(outPath, await Bun.file(embeddedLibPath).arrayBuffer())

    // Make executable on Unix systems
    if (process.platform !== 'win32') {
      spawnSync(['chmod', '+x', outPath])
    }

    return outPath
  } catch (error) {
    logger.error({ error }, 'Failed to extract PTY library binary')
    // Fallback to embedded library path if extraction fails
    return getBunLibraryPath()
  }
}

// Cache the promise to avoid multiple extractions
let ptyLibPathPromise: Promise<string | undefined> | null = null

const getPtyLibPath = (): Promise<string | undefined> => {
  if (!ptyLibPathPromise) {
    ptyLibPathPromise = getPtyLibraryPath()
  }
  return ptyLibPathPromise
}

/**
 * Dynamically load bun-pty module when first needed
 * This prevents startup failures if the native library is missing
 */
export async function loadBunPty(): Promise<BunPty | undefined> {
  if (bunPtyModule) {
    return bunPtyModule
  }

  try {
    const libPath = await getPtyLibPath()

    if (!libPath) {
      // logger.warn('No native library available for current platform')
      return undefined
    }

    // Set the environment variable that bun-pty reads
    process.env.BUN_PTY_LIB = libPath

    // Dynamic require to load after environment variable is set
    bunPtyModule = await import('bun-pty')

    logger.info(
      {
        platform: process.platform,
        arch: process.arch,
        libPath,
      },
      'Successfully loaded bun-pty'
    )

    return bunPtyModule
  } catch (error) {
    logger.error(
      {
        error,
        platform: process.platform,
        arch: process.arch,
        BUN_PTY_LIB: process.env.BUN_PTY_LIB,
      },
      'Failed to load bun-pty - will use fallback'
    )

    return undefined
  }
}
