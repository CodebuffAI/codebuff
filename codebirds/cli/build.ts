#!/usr/bin/env bun

/**
 * Freebuff CLI build script.
 *
 * Wraps the existing CLI build-binary.ts with CODEBIRDS_MODE=true
 * to produce a free-only variant of the Codebirds CLI.
 *
 * Usage:
 *   bun codebirds/cli/build.ts <version>
 *
 * Example:
 *   bun codebirds/cli/build.ts 1.0.0
 */

import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

const version = process.argv[2]
if (!version) {
  console.error('Usage: bun codebirds/cli/build.ts <version>')
  process.exit(1)
}

console.log(`Building Freebuff v${version}...`)

const result = spawnSync(
  'bun',
  ['cli/scripts/build-binary.ts', 'codebirds', version],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CODEBIRDS_MODE: 'true',
    },
  },
)

if (result.status !== 0) {
  console.error('Freebuff build failed')
  process.exit(result.status ?? 1)
}

console.log(`✅ Freebuff v${version} built successfully`)
