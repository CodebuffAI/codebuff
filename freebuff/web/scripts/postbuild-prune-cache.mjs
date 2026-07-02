/**
 * After `next build`, delete `.next/cache` so the Render deploy artifact stays
 * small. The webpack/Next cache can be multiple GB and is not needed at runtime;
 * removing it before Render compresses/uploads the build cuts deploy time.
 */
import { rm, access } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'

const webRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const cacheDir = join(webRoot, '.next/cache')
if (await exists(cacheDir)) {
  await rm(cacheDir, { recursive: true, force: true })
  console.log('[postbuild-prune-cache] removed .next/cache')
} else {
  console.log('[postbuild-prune-cache] no .next/cache to remove')
}
