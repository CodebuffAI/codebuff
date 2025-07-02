import path from 'path'
import { mkdirSync } from 'fs'
import { spawnSync } from 'bun'
import { rgPath as vscodeRgPath } from '@vscode/ripgrep'

import { CONFIG_DIR } from '../credentials'
import { logger } from '../utils/logger'

const getRipgrepPath = async (): Promise<string> => {
  // In dev mode, use the vscode ripgrep binary
  if (!process.env.IS_BINARY) {
    return vscodeRgPath
  }

  // Compiled mode - self-extract the embedded binary
  const rgFileName = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const outPath = path.join(CONFIG_DIR, rgFileName)

  // Check if already extracted
  if (await Bun.file(outPath).exists()) {
    return outPath
  }

  // Extract the embedded binary
  try {
    // Use require() on a static string path to make sure rg is included in the compiled binary
    const embeddedRgPath =
      process.platform === 'win32'
        ? require('../../../node_modules/@vscode/ripgrep/bin/rg.exe')
        : require('../../../node_modules/@vscode/ripgrep/bin/rg')

    // Create cache directory
    mkdirSync(path.dirname(outPath), { recursive: true })

    // Copy embedded binary to cache location
    await Bun.write(outPath, await Bun.file(embeddedRgPath).arrayBuffer())

    // Make executable on Unix systems
    if (process.platform !== 'win32') {
      spawnSync(['chmod', '+x', outPath])
    }

    return outPath
  } catch (error) {
    logger.error({ error }, 'Failed to extract ripgrep binary')
    // Fallback to vscode ripgrep if extraction fails
    return vscodeRgPath
  }
}

// Cache the promise to avoid multiple extractions
let rgPathPromise: Promise<string> | null = null

export const getRgPath = (): Promise<string> => {
  if (!rgPathPromise) {
    rgPathPromise = getRipgrepPath()
  }
  return rgPathPromise
}
