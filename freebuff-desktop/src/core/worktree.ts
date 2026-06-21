/**
 * Worktree manager (§6.1). One git worktree per active task under
 * `<project>/.freebuff/worktrees/<task-id>`, each on branch `freebuff/<task-slug>`,
 * **always branched from the default branch** (§8) — dependencies are ordering-only,
 * so branching from `main` already includes merged parents' work.
 *
 * V1 shells out to the user's local `git` + `gh` (§6.3). All git invocations go
 * through an injectable `CommandRunner` so this is testable against a real temp repo.
 */

import { join } from 'path'

import { bunRunner, runOrThrow, type CommandRunner } from './exec'
import type { TaskId } from './types'

export const BRANCH_PREFIX = 'freebuff/'

/** Turn a task title into a stable, filesystem/branch-safe slug. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return base || 'task'
}

export interface RebaseResult {
  clean: boolean
  /** Populated when `clean` is false — the conflict/error output for the human. */
  detail?: string
}

export interface WorktreeManagerOptions {
  /** Absolute path to the project's git repo root. */
  repoRoot: string
  defaultBranch?: string
  runner?: CommandRunner
}

export class WorktreeManager {
  private readonly repoRoot: string
  private readonly defaultBranch: string
  private readonly runner: CommandRunner

  constructor(opts: WorktreeManagerOptions) {
    this.repoRoot = opts.repoRoot
    this.defaultBranch = opts.defaultBranch ?? 'main'
    this.runner = opts.runner ?? bunRunner
  }

  worktreePath(taskId: TaskId): string {
    return join(this.repoRoot, '.freebuff', 'worktrees', taskId)
  }

  branchName(slug: string): string {
    return `${BRANCH_PREFIX}${slug}`
  }

  /**
   * Create the task's worktree + branch off the default branch. Returns the
   * branch name and worktree path to persist on the task.
   */
  async create(
    taskId: TaskId,
    slug: string,
  ): Promise<{ branch: string; worktreePath: string }> {
    const branch = this.branchName(slug)
    const path = this.worktreePath(taskId)
    await runOrThrow(
      this.runner,
      'git',
      ['-C', this.repoRoot, 'worktree', 'add', '-b', branch, path, this.defaultBranch],
    )
    return { branch, worktreePath: path }
  }

  /**
   * Rebase the task's branch onto the latest default branch (§6.2, §8). Run
   * before surfacing a task to catch sibling-merge races. On conflict, aborts the
   * rebase and reports `clean: false` so the engine can mark the task `blocked` —
   * there is no auto-resolving integration agent (§8).
   */
  async rebaseOntoDefault(
    taskId: TaskId,
    opts: { fetch?: boolean } = {},
  ): Promise<RebaseResult> {
    const cwd = this.worktreePath(taskId)
    if (opts.fetch ?? true) {
      // Best-effort: a missing remote shouldn't hard-fail a local rebase.
      await this.runner.run('git', ['-C', cwd, 'fetch', 'origin', this.defaultBranch], { cwd })
    }
    const rebase = await this.runner.run('git', ['-C', cwd, 'rebase', this.defaultBranch], { cwd })
    if (rebase.exitCode === 0) return { clean: true }
    await this.runner.run('git', ['-C', cwd, 'rebase', '--abort'], { cwd })
    return { clean: false, detail: rebase.stderr.trim() || rebase.stdout.trim() }
  }

  /**
   * Reset the task's branch + worktree to the tip of the latest default branch,
   * discarding prior commits/edits. Used when re-running a task from scratch
   * (request-changes / blocked-retry) so the re-implementation starts from latest
   * `main` and applies cleanly (§8, §12).
   */
  async resetToDefault(taskId: TaskId): Promise<void> {
    const cwd = this.worktreePath(taskId)
    await runOrThrow(this.runner, 'git', ['-C', cwd, 'reset', '--hard', this.defaultBranch], { cwd })
    await this.runner.run('git', ['-C', cwd, 'clean', '-fd'], { cwd })
  }

  /** Push the branch and open a PR via `gh` (§7 PR assembly). Returns the PR URL. */
  async pushAndOpenPr(
    taskId: TaskId,
    branch: string,
    pr: { title: string; body: string },
  ): Promise<string> {
    const cwd = this.worktreePath(taskId)
    await runOrThrow(this.runner, 'git', ['-C', cwd, 'push', '-u', 'origin', branch], { cwd })
    const out = await runOrThrow(
      this.runner,
      'gh',
      ['pr', 'create', '--base', this.defaultBranch, '--head', branch, '--title', pr.title, '--body', pr.body],
      { cwd },
    )
    return out.trim()
  }

  /** Squash-merge the PR via `gh pr merge --squash` (§8). Human-gated upstream. */
  async squashMerge(taskId: TaskId, branch: string): Promise<void> {
    const cwd = this.worktreePath(taskId)
    await runOrThrow(this.runner, 'gh', ['pr', 'merge', branch, '--squash'], { cwd })
  }

  /** Stage and commit everything in the worktree on its branch. Returns false if nothing to commit. */
  async commitAll(taskId: TaskId, message: string): Promise<boolean> {
    const cwd = this.worktreePath(taskId)
    await runOrThrow(this.runner, 'git', ['-C', cwd, 'add', '-A'], { cwd })
    const status = await this.runner.run('git', ['-C', cwd, 'status', '--porcelain'], { cwd })
    if (status.stdout.trim() === '') return false
    await runOrThrow(this.runner, 'git', ['-C', cwd, 'commit', '-m', message], { cwd })
    return true
  }

  /** Diff of the task branch against the default branch — the PR's contents (§7). */
  async diffAgainstDefault(taskId: TaskId): Promise<string> {
    const cwd = this.worktreePath(taskId)
    const out = await this.runner.run(
      'git',
      ['-C', cwd, 'diff', `${this.defaultBranch}...HEAD`],
      { cwd },
    )
    return out.stdout
  }

  /**
   * Working-tree diff against the default branch — includes BOTH committed and
   * uncommitted edits. Used to surface the latest state of a task that halted
   * (blocked/failed) before its PR stage could commit (§13: nothing is hidden).
   */
  async workingDiff(taskId: TaskId): Promise<string> {
    const cwd = this.worktreePath(taskId)
    await this.runner.run('git', ['-C', cwd, 'add', '-A', '-N'], { cwd })
    const out = await this.runner.run('git', ['-C', cwd, 'diff', this.defaultBranch], { cwd })
    return out.stdout
  }

  /** Does the repo have a configured `origin` remote? Drives gh vs. local-merge path. */
  async hasRemote(): Promise<boolean> {
    const out = await this.runner.run('git', ['-C', this.repoRoot, 'remote'], {})
    return out.stdout.split('\n').some((r) => r.trim() === 'origin')
  }

  /**
   * Local squash-merge of the task branch into the default branch (§8) — used when
   * there is no GitHub remote (local verification). Mirrors `gh pr merge --squash`:
   * one clean commit on the default branch.
   */
  async localSquashMerge(branch: string, message: string): Promise<void> {
    const root = this.repoRoot
    try {
      await runOrThrow(this.runner, 'git', ['-C', root, 'checkout', this.defaultBranch])
      await runOrThrow(this.runner, 'git', ['-C', root, 'merge', '--squash', branch])
      await runOrThrow(this.runner, 'git', ['-C', root, 'commit', '-m', message])
    } catch (err) {
      // Never leave the default branch's working tree in a conflicted state.
      await this.runner.run('git', ['-C', root, 'merge', '--abort']).catch(() => {})
      await this.runner.run('git', ['-C', root, 'reset', '--hard', 'HEAD']).catch(() => {})
      throw err
    }
  }

  /** GC the worktree on merge/abandon (§6.1). Best-effort; prunes stale refs. */
  async remove(taskId: TaskId): Promise<void> {
    const path = this.worktreePath(taskId)
    await this.runner.run('git', ['-C', this.repoRoot, 'worktree', 'remove', '--force', path])
    await this.runner.run('git', ['-C', this.repoRoot, 'worktree', 'prune'])
  }
}
