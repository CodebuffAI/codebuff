import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
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

  test('rebaseOntoDefault() is clean when changes do not collide', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { worktreePath } = await mgr.create('t1', 'feature')

    // Task branch edits a new file.
    writeFileSync(join(worktreePath, 'feature.txt'), 'hi\n')
    await git(['add', '.'], worktreePath)
    await git(['commit', '-m', 'feature'], worktreePath)

    // main advances on a different file.
    writeFileSync(join(repoRoot, 'other.txt'), 'other\n')
    await git(['add', '.'])
    await git(['commit', '-m', 'unrelated main change'])

    const res = await mgr.rebaseOntoDefault('t1', { fetch: false })
    expect(res.clean).toBe(true)
    expect(existsSync(join(worktreePath, 'other.txt'))).toBe(true)
  })

  test('rebaseOntoDefault() reports a conflict and aborts cleanly', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { worktreePath } = await mgr.create('t1', 'feature')

    // Both the branch and main edit the same line — a sibling-merge race (§8).
    writeFileSync(join(worktreePath, 'file.txt'), 'branch version\n')
    await git(['add', '.'], worktreePath)
    await git(['commit', '-m', 'branch edit'], worktreePath)

    writeFileSync(join(repoRoot, 'file.txt'), 'main version\n')
    await git(['add', '.'])
    await git(['commit', '-m', 'main edit'])

    const res = await mgr.rebaseOntoDefault('t1', { fetch: false })
    expect(res.clean).toBe(false)
    expect(res.detail).toBeTruthy()

    // Rebase was aborted, so the worktree is back on its own commit, usable.
    const status = await bunRunner.run('git', ['-C', worktreePath, 'status', '--porcelain'], { cwd: worktreePath })
    expect(status.stdout.trim()).toBe('')
  })

  test('localSquashMerge merges a clean branch into the default branch', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { branch, worktreePath } = await mgr.create('t1', 'feature')
    writeFileSync(join(worktreePath, 'feature.txt'), 'hi\n')
    await git(['add', '.'], worktreePath)
    await git(['commit', '-m', 'feature'], worktreePath)

    await mgr.localSquashMerge(branch, 'merge feature')
    expect(existsSync(join(repoRoot, 'feature.txt'))).toBe(true)
    const log = await git(['log', '--oneline'])
    expect(log).toContain('merge feature')
  })

  test('localSquashMerge aborts and leaves the default branch clean on conflict', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    // Two branches off main both edit the same line — a sibling-merge race (§8).
    const a = await mgr.create('ta', 'a')
    writeFileSync(join(a.worktreePath, 'file.txt'), 'A\n')
    await git(['add', '.'], a.worktreePath)
    await git(['commit', '-m', 'a edit'], a.worktreePath)

    const b = await mgr.create('tb', 'b')
    writeFileSync(join(b.worktreePath, 'file.txt'), 'B\n')
    await git(['add', '.'], b.worktreePath)
    await git(['commit', '-m', 'b edit'], b.worktreePath)

    await mgr.localSquashMerge(a.branch, 'merge a') // first merge: clean
    // Second merge conflicts; it must throw AND leave main's working tree clean.
    let threw = false
    try {
      await mgr.localSquashMerge(b.branch, 'merge b')
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    const status = await bunRunner.run('git', ['-C', repoRoot, 'status', '--porcelain'], {})
    expect(status.stdout.trim()).toBe('')
    expect(await git(['rev-parse', '--abbrev-ref', 'HEAD'])).toContain('main')
  })

  test('resetToDefault re-points a branch onto the latest default branch', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { worktreePath } = await mgr.create('t1', 'feature')
    writeFileSync(join(worktreePath, 'feature.txt'), 'hi\n')
    await git(['add', '.'], worktreePath)
    await git(['commit', '-m', 'feature'], worktreePath)
    // main advances after the branch was cut.
    writeFileSync(join(repoRoot, 'newfile.txt'), 'new\n')
    await git(['add', '.'])
    await git(['commit', '-m', 'main moves on'])

    await mgr.resetToDefault('t1')
    // The branch now matches main: feature work gone, main's new file present.
    expect(existsSync(join(worktreePath, 'feature.txt'))).toBe(false)
    expect(existsSync(join(worktreePath, 'newfile.txt'))).toBe(true)
    expect((await mgr.diffAgainstDefault('t1')).trim()).toBe('')
  })

  test('remove() GCs the worktree', async () => {
    const mgr = new WorktreeManager({ repoRoot, runner: bunRunner })
    const { worktreePath } = await mgr.create('t1', 'feature')
    expect(existsSync(worktreePath)).toBe(true)
    await mgr.remove('t1')
    expect(existsSync(worktreePath)).toBe(false)
  })
})
