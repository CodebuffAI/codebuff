/**
 * Stage the Bun binary that ships inside the packaged app.
 *
 * The packaged orchestrator runs under Bun (it uses bun:sqlite, import.meta,
 * Bun.serve, ...), so a Bun binary must travel with the app — we cannot assume
 * the user has Bun on PATH. electron-builder picks this up via extraResources.
 *
 *   bun scripts/fetch-bun.ts                 # stage Bun for the host platform
 *   bun scripts/fetch-bun.ts --target darwin-arm64
 *
 * For the host platform we copy the currently-running Bun (guaranteed to match
 * version + arch and to actually work locally). For a cross-target we download
 * the pinned release from oven-sh/bun.
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

const PKG_DIR = join(import.meta.dir, '..')
const OUT_DIR = join(PKG_DIR, 'staging', 'bun')
// Single source of truth for the Bun version: the monorepo's engines.bun.
const ROOT_PKG = JSON.parse(readFileSync(join(PKG_DIR, '..', 'package.json'), 'utf8'))
const PINNED: string = ROOT_PKG.engines?.bun ?? Bun.version

// node platform/arch → bun release slug
const SLUG: Record<string, string> = {
  'darwin-arm64': 'bun-darwin-aarch64',
  'darwin-x64': 'bun-darwin-x64',
  'linux-x64': 'bun-linux-x64',
  'linux-arm64': 'bun-linux-aarch64',
  'win32-x64': 'bun-windows-x64',
}

function parseTarget(): { platform: string; arch: string } {
  const i = process.argv.indexOf('--target')
  if (i !== -1 && process.argv[i + 1]) {
    const [platform, arch] = process.argv[i + 1].split('-')
    return { platform, arch }
  }
  return { platform: process.platform, arch: process.arch }
}

async function download(slug: string, dest: string, binName: string) {
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${PINNED}/${slug}.zip`
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
  const zipPath = join(OUT_DIR, `${slug}.zip`)
  await Bun.write(zipPath, await res.arrayBuffer())
  // The zip contains <slug>/bun (or bun.exe). Extract with the system unzip.
  const proc = Bun.spawnSync(['unzip', '-o', zipPath, '-d', OUT_DIR])
  if (proc.exitCode !== 0) throw new Error('unzip failed: ' + proc.stderr.toString())
  copyFileSync(join(OUT_DIR, slug, binName), dest)
  rmSync(zipPath, { force: true })
  rmSync(join(OUT_DIR, slug), { recursive: true, force: true })
}

const { platform, arch } = parseTarget()
const key = `${platform}-${arch}`
const slug = SLUG[key]
if (!slug) {
  console.error(`Unsupported target "${key}". Known: ${Object.keys(SLUG).join(', ')}`)
  process.exit(1)
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const binName = platform === 'win32' ? 'bun.exe' : 'bun'
const dest = join(OUT_DIR, binName)

const isHost = platform === process.platform && arch === process.arch
if (isHost && existsSync(process.execPath)) {
  // process.execPath is the Bun binary currently running this script.
  console.log(`Copying host Bun ${Bun.version} from ${process.execPath}`)
  copyFileSync(process.execPath, dest)
} else {
  await download(slug, dest, binName)
}

if (platform !== 'win32') chmodSync(dest, 0o755)
console.log(`Staged Bun → ${dest}`)
