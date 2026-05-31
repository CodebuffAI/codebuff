import { constants, existsSync, accessSync } from 'fs'
import { join, dirname, delimiter } from 'path'
import { fileURLToPath } from 'url'

import { getSdkEnv } from '../env'

import type { SdkEnv } from '../types/env'

function findExecutableOnPath(binaryName: string, env: SdkEnv): string | null {
  const pathEnv = env.PATH ?? process.env.PATH
  if (!pathEnv) return null

  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, binaryName)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {}
  }

  return null
}

/**
 * Get the path to the bundled ripgrep binary based on the current platform
 * @param importMetaUrl - import.meta.url from the calling module
 * @returns Path to the ripgrep binary
 */
export function getBundledRgPath(
  importMetaUrl?: string,
  env: SdkEnv = getSdkEnv(),
): string {
  // Allow override via environment variable, but do not return a stale path.
  // If the configured binary is missing, continue to bundled/PATH fallbacks.
  if (env.CODEBUFF_RG_PATH && existsSync(env.CODEBUFF_RG_PATH)) {
    return env.CODEBUFF_RG_PATH
  }

  // Determine platform-specific directory name
  const platform = process.platform
  const arch = process.arch

  let platformDir: string
  if (platform === 'win32' && arch === 'x64') {
    platformDir = 'x64-win32'
  } else if (platform === 'darwin' && arch === 'arm64') {
    platformDir = 'arm64-darwin'
  } else if (platform === 'darwin' && arch === 'x64') {
    platformDir = 'x64-darwin'
  } else if (platform === 'linux' && arch === 'arm64') {
    platformDir = 'arm64-linux'
  } else if (platform === 'linux' && arch === 'x64') {
    platformDir = 'x64-linux'
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`)
  }

  const binaryName = platform === 'win32' ? 'rg.exe' : 'rg'

  // Try to find the bundled binary relative to this module
  let vendorPath: string | undefined

  // Use the SDK's own import.meta.url if none is provided
  const metaUrl = importMetaUrl || import.meta.url

  if (metaUrl) {
    // ESM context - use import.meta.url to find relative path
    const currentFile = fileURLToPath(metaUrl)
    const currentDir = dirname(currentFile)

    // Try relative to current file (development - from src/native/ripgrep.ts to vendor/)
    const devPath = join(
      currentDir,
      '..',
      '..',
      'vendor',
      'ripgrep',
      platformDir,
      binaryName,
    )
    if (existsSync(devPath)) {
      vendorPath = devPath
    }

    // Try relative to bundled dist file (production - from dist/index.mjs to dist/vendor/)
    const distPath = join(
      currentDir,
      'vendor',
      'ripgrep',
      platformDir,
      binaryName,
    )
    if (existsSync(distPath)) {
      vendorPath = distPath
    }
  }

  // If not found via importMetaUrl, try CJS approach or other methods
  if (!vendorPath) {
    // Try from __dirname if available (CJS context)
    const dirname = new Function(
      `try { return __dirname; } catch (e) { return undefined; }`,
    )()

    if (typeof dirname !== 'undefined') {
      const cjsPath = join(
        dirname,
        '..',
        '..',
        'vendor',
        'ripgrep',
        platformDir,
        binaryName,
      )
      if (existsSync(cjsPath)) {
        vendorPath = cjsPath
      }
      const cjsPath2 = join(
        dirname,
        'vendor',
        'ripgrep',
        platformDir,
        binaryName,
      )
      if (existsSync(cjsPath2)) {
        vendorPath = cjsPath2
      }
    }
  }

  if (vendorPath && existsSync(vendorPath)) {
    return vendorPath
  }

  const pathRg = findExecutableOnPath(binaryName, env)
  if (pathRg) {
    return pathRg
  }

  // Fallback: try to find in dist/vendor (for published package)
  const distVendorPath = join(
    process.cwd(),
    'node_modules',
    '@codebuff',
    'sdk',
    'dist',
    'vendor',
    'ripgrep',
    platformDir,
    binaryName,
  )
  if (existsSync(distVendorPath)) {
    return distVendorPath
  }

  const fallbackPathRg = findExecutableOnPath(binaryName, env)
  if (fallbackPathRg) {
    return fallbackPathRg
  }

  // No fallback available - bundled binaries are required
  throw new Error(
    `Ripgrep binary not found for ${platform}-${arch}. ` +
      `Expected at: ${vendorPath} or ${distVendorPath}, and no '${binaryName}' executable was found on PATH. ` +
      `Please run 'npm run fetch-ripgrep', install ripgrep, or set CODEBUFF_RG_PATH environment variable.`,
  )
}
