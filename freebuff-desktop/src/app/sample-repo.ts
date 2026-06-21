/**
 * Scaffolds a tiny but real git repo for the agents to work on, so end-to-end runs
 * produce genuine diffs/PRs. Used for local verification when no real project is
 * attached. Idempotent: if the repo already exists, it's left alone.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { bunRunner } from '../core/exec'

const FILES: Record<string, string> = {
  '.gitignore': '.freebuff/\nnode_modules/\n',
  'package.json': JSON.stringify(
    {
      name: 'freebuff-demo-app',
      version: '0.1.0',
      type: 'module',
      scripts: { test: 'node --test' },
    },
    null,
    2,
  ) + '\n',
  'README.md':
    '# Freebuff Demo App\n\nA tiny math + string utility library used to ' +
    'demonstrate Freebuff Desktop end-to-end.\n',
  'src/math.js':
    `// Simple math utilities.\n` +
    `export function add(a, b) {\n  return a + b\n}\n\n` +
    `export function subtract(a, b) {\n  return a - b\n}\n`,
  'src/strings.js':
    `// Simple string utilities.\n` +
    `export function capitalize(s) {\n  return s.charAt(0).toUpperCase() + s.slice(1)\n}\n`,
  'test/math.test.js':
    `import { test } from 'node:test'\n` +
    `import assert from 'node:assert'\n` +
    `import { add, subtract } from '../src/math.js'\n\n` +
    `test('add', () => { assert.equal(add(2, 3), 5) })\n` +
    `test('subtract', () => { assert.equal(subtract(5, 2), 3) })\n`,
}

export async function ensureSampleRepo(repoRoot: string): Promise<void> {
  if (existsSync(join(repoRoot, '.git'))) return
  mkdirSync(repoRoot, { recursive: true })
  for (const [rel, content] of Object.entries(FILES)) {
    const full = join(repoRoot, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  const git = (args: string[]) => bunRunner.run('git', ['-C', repoRoot, ...args])
  await bunRunner.run('git', ['init', '-b', 'main', repoRoot])
  await git(['config', 'user.email', 'desktop@freebuff.local'])
  await git(['config', 'user.name', 'Freebuff Desktop'])
  await git(['add', '-A'])
  await git(['commit', '-m', 'Initial commit: demo math + string utils'])
}
