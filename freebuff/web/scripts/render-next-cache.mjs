/**
 * Persist `.next/cache` across Render builds via $XDG_CACHE_HOME, which Render
 * keeps between builds (unlike the project directory's `.next/cache`, which we
 * delete so the deploy artifact stays small — see postbuild-prune-cache.mjs).
 *
 * Usage:
 *   node scripts/render-next-cache.mjs restore   # before `next build`
 *   node scripts/render-next-cache.mjs save      # after `next build`
 *
 * `restore` moves the stashed cache into `.next/cache`; `save` moves it back
 * out of the project dir (so it is never compressed into the deploy artifact)
 * and doubles as the prune step. Both are no-ops outside Render (RENDER unset)
 * so local builds are unaffected.
 */
import { access, mkdir, rename, rm, cp, stat, readdir } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'

const webRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const projectCache = join(webRoot, '.next/cache')

// Drop the stash if it balloons past this — a huge bundler cache (Turbopack
// filesystem cache, `.next/cache/turbopack`) slows Render's build-cache
// download/extraction more than it saves in compile time.
const MAX_STASH_BYTES = 3 * 1024 * 1024 * 1024

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function dirSize(path, cap) {
  let total = 0
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      total += await dirSize(child, cap - total)
    } else if (entry.isFile()) {
      total += (await stat(child).catch(() => ({ size: 0 }))).size
    }
    if (total > cap) return total
  }
  return total
}

async function move(from, to) {
  await mkdir(join(to, '..'), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    // Cross-device fallback
    await cp(from, to, { recursive: true, force: true })
    await rm(from, { recursive: true, force: true })
  }
}

const mode = process.argv[2]
if (mode !== 'restore' && mode !== 'save') {
  console.error('[render-next-cache] usage: render-next-cache.mjs <restore|save>')
  process.exit(1)
}

if (!process.env.RENDER) {
  console.log(`[render-next-cache] not on Render; skipping ${mode}`)
  process.exit(0)
}

const stashRoot = process.env.XDG_CACHE_HOME ?? '/opt/render/.cache'
const stash = join(stashRoot, 'freebuff-web', 'next-cache')

if (mode === 'restore') {
  if (await exists(stash)) {
    await rm(projectCache, { recursive: true, force: true })
    await move(stash, projectCache)
    console.log(`[render-next-cache] restored ${stash} -> .next/cache`)
  } else {
    console.log('[render-next-cache] no stashed cache; cold build')
  }
} else {
  if (await exists(projectCache)) {
    const size = await dirSize(projectCache, MAX_STASH_BYTES)
    if (size > MAX_STASH_BYTES) {
      await rm(projectCache, { recursive: true, force: true })
      console.log(
        `[render-next-cache] cache exceeded ${MAX_STASH_BYTES} bytes; dropped instead of stashing`,
      )
    } else {
      await rm(stash, { recursive: true, force: true })
      await move(projectCache, stash)
      console.log(`[render-next-cache] stashed .next/cache -> ${stash}`)
    }
  } else {
    console.log('[render-next-cache] no .next/cache to stash')
  }
}
