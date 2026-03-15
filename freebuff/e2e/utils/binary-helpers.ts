import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '../../..')

export function getFreebuffBinaryPath(): string {
  if (process.env.FREEBUFF_BINARY) {
    return resolve(process.env.FREEBUFF_BINARY)
  }
  return resolve(REPO_ROOT, 'cli/bin/freebuff')
}

export function requireFreebuffBinary(): string {
  const binaryPath = getFreebuffBinaryPath()
  if (!existsSync(binaryPath)) {
    throw new Error(
      `Freebuff binary not found at ${binaryPath}. ` +
        'Build with: bun freebuff/cli/build.ts <version>',
    )
  }
  return binaryPath
}
