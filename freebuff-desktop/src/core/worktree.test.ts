import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { bunRunner } from './exec'
import { WorktreeManager, slugify } from './worktree'

describe('slugify', () => {
  test('normalizes titles to branch-safe slugs', () => {
    expect(slugify('Add Dark Mode!')).toBe('add-dark-mode')
    expect(slugify('  spaces & symbols  ')).toBe('spaces-symbols')
    expect(slugify('')).toBe('task')
  })
})

describe('WorktreeManager (real git)', () => {
  let repoRoot: string

  async function git(args: string[], cwd = repoRoot) {
    const r = await bunRunner.run('git', ['-C', cwd, ...args], { cwd })
    if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
    return r.stdout
  }

  beforeEach(async () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'fb-wt-'))
    await bunRunner.run('git', ['init', '-b', 'main', repoRoot])
    await git(['config', 'user.email', 'test@example.com'])
    await git(['config', 'user.name', 'Test'])
    writeFileSync(join(repoRoot, '.gitignore'), '.freebuff/\n')
    writeFileSync(join(repoRoot, 'file.txt'), 'base\n')
    await git(['add', '.'])
    await git(['commit', '-m', 'init'])
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  test('create() makes a worktree on a freebuff/ branch from main', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { branch, worktreePath } = await mgr.create('t1', 'add-thing')
    expect(branch).toBe('freebuff/add-thing')
    expect(worktreePath).toBe(join(repoRoot, '.freebuff', 'worktrees', 't1'))
    expect(existsSync(join(worktreePath, 'file.txt'))).toBe(true)
  })

  test('create() recovers when a registered worktree + branch are left behind', async () => {
    // Simulates a previous session that created t1's worktree then force-quit
    // before cleanup. The thread id (and so the path) is reused next launch.
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    await mgr.create('t1', 'old-title')
    // Same id, new title (new branch) — used to fail with "<path> already exists".
    const { branch, worktreePath } = await mgr.create('t1', 'new-title')
    expect(branch).toBe('freebuff/new-title')
    expect(existsSync(join(worktreePath, 'file.txt'))).toBe(true)
    const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath)
    expect(head.trim()).toBe('freebuff/new-title')
  })

  test('create() recovers when only an unregistered leftover dir remains', async () => {
    // A leftover already pruned from git's metadata still occupies the path on
    // disk; `worktree add` would error "already exists" without the dir cleanup.
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const path = mgr.worktreePath('t1')
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'stale.txt'), 'orphan\n')

    const { worktreePath } = await mgr.create('t1', 'fresh')
    // Fresh checkout: the orphan file is gone, the tracked file is present.
    expect(existsSync(join(worktreePath, 'stale.txt'))).toBe(false)
    expect(existsSync(join(worktreePath, 'file.txt'))).toBe(true)
  })

  test('remove() GCs the worktree', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { worktreePath } = await mgr.create('t1', 'feature')
    expect(existsSync(worktreePath)).toBe(true)
    await mgr.remove('t1')
    expect(existsSync(worktreePath)).toBe(false)
  })

  test('closeOut() snapshots dirty work, returns the tip, and GCs the worktree', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { branch, worktreePath } = await mgr.create('t1', 'feature')
    // Leave an uncommitted edit so closeOut has to WIP-commit it.
    writeFileSync(join(worktreePath, 'feature.txt'), 'wip\n')

    const sha = await mgr.closeOut('t1', { branch, worktreePath, wipTitle: 'feature' })
    expect(sha).toBeTruthy()
    // Worktree dir + branch ref are gone, but the snapshot tag preserves the tip.
    expect(existsSync(worktreePath)).toBe(false)
    const tag = await git(['rev-parse', 'freebuff-snapshot/t1'])
    expect(tag.trim()).toBe(sha!)
  })
})
