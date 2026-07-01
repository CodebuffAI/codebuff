#!/usr/bin/env bun

/**
 * Bump (or set) the version in freebuff-desktop/package.json and print the new
 * version to stdout.
 *
 *   bun scripts/bump-version.ts patch|minor|major   # bump relative
 *   bun scripts/bump-version.ts 1.2.3               # set exact (idempotent stamp)
 *
 * Why not `npm version`? freebuff-desktop is a member of the root Bun
 * workspace, so npm resolves the whole workspace and dies on the sibling
 * package `@codebuff/.agents` ("name cannot start with a period"). Bun allows
 * that name; npm does not. This script sidesteps npm entirely.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = process.argv[2] ?? 'patch'
const pkgPath = join(import.meta.dir, '..', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

function nextVersion(current: string, bump: string): string {
  if (/^\d+\.\d+\.\d+$/.test(bump)) {
    // Exact version — used by the build job to re-stamp the already-computed
    // release version (replaces `npm version X --allow-same-version`).
    return bump
  }

  const parts = current.split('.').map((n) => Number.parseInt(n, 10))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Unparseable current version: "${current}"`)
  }
  const [major, minor, patch] = parts
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Invalid bump type: "${bump}" (use patch|minor|major or an exact x.y.z)`)
  }
}

const next = nextVersion(pkg.version, arg)
pkg.version = next
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(next)
