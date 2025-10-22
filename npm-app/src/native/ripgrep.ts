import { mkdirSync } from 'fs'
import path from 'path'

import { spawnSync } from 'bun'
import { getBundledRgPath } from '@codebuff/sdk'

import { CONFIG_DIR } from '../credentials'
import { logger } from '../utils/logger'

const getRipgrepPath = async (): Promise<string> => {
  let bundledRgPath: string
  try {
    bundledRgPath = getBundledRgPath(import.meta.url)
  } catch (error) {
    logger.error({ error }, 'Failed to resolve bundled ripgrep path')
    throw error
  }

  // In dev mode, use the bundled path directly
  if (!process.env.IS_BINARY) {
    return bundledRgPath
  }

  // Compiled mode - stage the bundled binary in the config directory
  const rgFileName = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const outPath = path.join(CONFIG_DIR, rgFileName)

  try {
    if (await Bun.file(outPath).exists()) {
      return outPath
    }

    mkdirSync(path.dirname(outPath), { recursive: true })
    await Bun.write(outPath, await Bun.file(bundledRgPath).arrayBuffer())

    if (process.platform !== 'win32') {
      spawnSync(['chmod', '+x', outPath])
    }

    return outPath
  } catch (error) {
    logger.error(
      { error },
      'Failed to stage bundled ripgrep binary, using fallback path',
    )
    return bundledRgPath
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
