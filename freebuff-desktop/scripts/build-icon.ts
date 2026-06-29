/**
 * Build the packaged-app icons used by electron-builder.
 *
 * Inputs:
 *   - The freebuff mark lives at src/app/ui/components/freebuff-logo.svg (and a
 *     512×512 PNG at freebuff/web/public/logo-icon.png that we mirror here as
 *     the source for the bitmap pipeline).
 *
 * Outputs (all under freebuff-desktop/build/):
 *   - icon.png   512×512 — Linux + electron's runtime BrowserWindow icon.
 *   - icon.icns          — macOS (built with `iconutil` on macOS hosts).
 *   - icon.ico           — Windows (multi-resolution, PNG payloads).
 *
 * Bitmap resampling is done with `sips` on macOS (the only supported host for
 * `iconutil`). To regenerate on Linux/Windows, drop a 512×512 icon.png into
 * build/ and supply a pre-built icon.icns / icon.ico.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(import.meta.dir, '..', '..')
const OUT = resolve(REPO, 'freebuff-desktop', 'build')
const SOURCE_PNG = resolve(REPO, 'freebuff', 'web', 'public', 'logo-icon.png')

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

// Icon generation relies on macOS-only tooling (`sips` + `iconutil`). The built
// icons (icon.png / icon.icns / icon.ico) are committed to build/, so on a
// non-macOS host (e.g. the Linux/Windows CI runners that package the app) we
// simply reuse the committed assets instead of regenerating them.
if (process.platform !== 'darwin') {
  const committed = ['icon.png', 'icon.icns', 'icon.ico'].map((f) => resolve(OUT, f))
  if (committed.every((f) => existsSync(f))) {
    console.log('Non-macOS host: reusing committed build/ icons (skipping regeneration).')
    process.exit(0)
  }
  throw new Error(
    'Icon generation requires macOS (sips/iconutil). On other platforms, commit ' +
      'prebuilt build/icon.{png,icns,ico} (run this script once on macOS) so packaging can proceed.',
  )
}

// 1. Master PNG — also used by electron itself at runtime.
const iconPng = resolve(OUT, 'icon.png')
spawnSync('cp', [SOURCE_PNG, iconPng], { stdio: 'inherit' })
if (!existsSync(iconPng)) {
  throw new Error(`failed to copy ${SOURCE_PNG} → ${iconPng}`)
}

// 2. macOS .icns — uses the canonical iconset layout.
const iconset = resolve(OUT, 'icon.iconset')
if (existsSync(iconset)) spawnSync('rm', ['-rf', iconset])
mkdirSync(iconset, { recursive: true })

const ICNS_SIZES: Array<[number, string]> = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
]
for (const [size, name] of ICNS_SIZES) {
  spawnSync('sips', ['-z', String(size), String(size), iconPng, '--out', resolve(iconset, name)], {
    stdio: 'inherit',
  })
}
spawnSync('iconutil', ['-c', 'icns', iconset, '-o', resolve(OUT, 'icon.icns')], { stdio: 'inherit' })
spawnSync('rm', ['-rf', iconset])

// 3. Windows .ico — multi-resolution PNG payloads. Vista+ accepts PNG bytes
// inside an ICO container, which is what Electron + the .NET IconExtractor
// expect. We assemble the file by hand to avoid pulling in a Node ICO lib.
const ICO_SIZES = [16, 32, 48, 64, 128, 256]
const icoDir = resolve(OUT, '.ico-src')
mkdirSync(icoDir, { recursive: true })
const pngs: Array<{ size: number; data: Buffer }> = []
for (const size of ICO_SIZES) {
  const out = resolve(icoDir, `${size}.png`)
  spawnSync('sips', ['-z', String(size), String(size), iconPng, '--out', out], { stdio: 'inherit' })
  pngs.push({ size, data: Buffer.from(readFileSync(out)) })
}
spawnSync('rm', ['-rf', icoDir])

const headerLen = 6 + 16 * pngs.length
let offset = headerLen
const entries: Buffer[] = []
const data: Buffer[] = []
for (const { size, data: png } of pngs) {
  // Width/Height: 0 means 256 in ICO format.
  const w = size === 256 ? 0 : size
  const h = size === 256 ? 0 : size
  const entry = Buffer.alloc(16)
  entry.writeUInt8(w, 0)
  entry.writeUInt8(h, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  entries.push(entry)
  data.push(png)
  offset += png.length
}

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(pngs.length, 4)

writeFileSync(resolve(OUT, 'icon.ico'), Buffer.concat([header, ...entries, ...data]))
console.log(`wrote ${resolve(OUT, 'icon.png')}, icon.icns, icon.ico`)
