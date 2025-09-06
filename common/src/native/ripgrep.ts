import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

type PlatformKey =
  | 'darwin-arm64'
  | 'darwin-x64'
  | 'linux-arm64'
  | 'linux-x64'
  | 'win32-arm64'
  | 'win32-x64';

// Fallback CONFIG_DIR since constants.ts doesn't export it
const CONFIG_DIR = process.env.HOME ? path.join(process.env.HOME, '.config/codebuff') : path.join(process.cwd(), '.config/codebuff')

// Compute platform/arch key
const getPlatformKey = (): string => {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  } else if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
  } else if (platform === 'win32') {
    return arch === 'arm64' ? 'win32-arm64' : 'win32-x64'
  }
  throw new Error(`Unsupported platform/arch: ${platform}-${arch}`)
}

const platformKey = getPlatformKey() as PlatformKey
if (!['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'].includes(platformKey)) {
  throw new Error(`Unsupported platform/arch: ${platformKey}`)
}
const rgFileName = platformKey.startsWith('win32') ? 'rg.exe' : 'rg'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const bundledPath = path.join(__dirname, '../../bin/ripgrep', platformKey, rgFileName)

// Cache the promise to avoid multiple extractions
let rgPathPromise: Promise<string> | null = null

export const getRgPath = async (): Promise<string> => {
  if (rgPathPromise) return rgPathPromise

  rgPathPromise = (async () => {
    // Override if set
    if (process.env.CODEBUFF_RG_PATH) {
      return process.env.CODEBUFF_RG_PATH
    }

    // Determine cache path for compiled mode
    if (process.env.IS_BINARY) {
      const cacheDir = process.env.CODEBUFF_RG_CACHE_DIR || path.join(CONFIG_DIR, 'rg')
      const cachePath = path.join(cacheDir, rgFileName)

      // Check if already extracted
      try {
        await fs.access(cachePath)
        return cachePath
      } catch {}

      // Extract to cache
      await fs.mkdir(path.dirname(cachePath), { recursive: true })
      await fs.copyFile(bundledPath, cachePath)

      // Validate copied file
      const stats = await fs.stat(cachePath)
      if (stats.size === 0) {
        throw new Error(`Extracted ripgrep binary at ${cachePath} is empty`)
      }

      // Make executable on non-Windows
      if (!platformKey.startsWith('win32')) {
        const { status } = spawnSync('chmod', ['+x', cachePath], { stdio: 'ignore' })
        if (status !== 0) {
          throw new Error(`Failed to make ripgrep executable at ${cachePath}`)
        }
      }

      return cachePath
    } else {
      // Node mode: return bundled path directly, validate it exists
      try {
        await fs.access(bundledPath)
      } catch (error) {
        throw new Error(`Bundled ripgrep binary not found at ${bundledPath}`)
      }
      return bundledPath
    }
  })()

  return rgPathPromise
}

// For compiled mode bundling: force inclusion of binaries (guarded)
if (process.env.IS_BINARY) {
  const binaryUrls: Record<PlatformKey, URL> = {
    'darwin-arm64': new URL('../../bin/ripgrep/darwin-arm64/rg', import.meta.url),
    'darwin-x64': new URL('../../bin/ripgrep/darwin-x64/rg', import.meta.url),
    'linux-arm64': new URL('../../bin/ripgrep/linux-arm64/rg', import.meta.url),
    'linux-x64': new URL('../../bin/ripgrep/linux-x64/rg', import.meta.url),
    'win32-arm64': new URL('../../bin/ripgrep/win32-arm64/rg.exe', import.meta.url),
    'win32-x64': new URL('../../bin/ripgrep/win32-x64/rg.exe', import.meta.url),
  }
  const binaryUrl = binaryUrls[platformKey]
  if (!binaryUrl) {
    throw new Error(`Unsupported platform for bundling: ${platformKey}`)
  }
  // Force bundler to include by accessing the URL
  void binaryUrl.pathname
}

export { rgPathPromise as rgPath }