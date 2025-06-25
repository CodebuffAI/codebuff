import { logger } from '../utils/logger'
import { suppressConsoleOutput } from '../utils/suppress-console'

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
let loadAttempted = false
let loadError: Error | undefined = undefined

/**
 * Get the native library path for the current platform
 */
function getNativeLibraryPath(): string | undefined {
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
 * Dynamically load bun-pty module when first needed
 * This prevents startup failures if the native library is missing
 */
export async function loadBunPty(): Promise<BunPty | undefined> {
  // Return cached result if we've already attempted to load
  if (loadAttempted) {
    return bunPtyModule
  }

  loadAttempted = true

  try {
    const libPath = getNativeLibraryPath()

    if (!libPath) {
      // logger.warn('No native library available for current platform')
      return undefined
    }

    // Set the environment variable that bun-pty reads
    process.env.BUN_PTY_LIB = libPath

    const removeConsoleSuppression = suppressConsoleOutput('all', (args) => {
      return JSON.stringify(args).includes('ERR_DLOPEN_FAILED')
    })

    // Dynamic require to load after environment variable is set
    // Using require instead of import ensures synchronous execution order
    // Open bug in loading a rust binary: https://github.com/oven-sh/bun/issues/11598
    bunPtyModule = await import('bun-pty')

    removeConsoleSuppression()

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
    loadError = error as Error

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
