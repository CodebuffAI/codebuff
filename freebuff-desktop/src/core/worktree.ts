/**
 * Worktree manager. One git worktree per thread (tab) under
 * `<project>/.freebuff/worktrees/<thread-id>`, each on its own branch
 * `freebuff/<thread-slug>`, branched from the default branch. A thread's turns
 * run inside its worktree so parallel tabs never touch each other's files.
 *
 * The lifecycle is just three operations: `create` (lazily, on a thread's first
 * turn), `closeOut` (snapshot + GC when a tab is closed, recoverable via
 * `lastSeenHead`), and `remove` (hard delete). PRs and merges are driven by the
 * agent itself via shell commands (the open-pr / merge skills), not by this class.
 *
 * V1 shells out to the user's local `git`. All git invocations go through an
 * injectable `CommandRunner` so this is testable against a real temp repo.
 */

import { rmSync } from 'fs'
import { join } from 'path'

import { bunRunner, runOrThrow, type CommandRunner } from './exec'

/** A worktree is keyed by an opaque id (a thread id in the thread model). */
type TaskId = string

export const BRANCH_PREFIX = 'freebuff/'

/** Turn a string into a stable, filesystem/branch-safe slug. Defaults suit thread
 *  titles (≤50 chars, `task` fallback); callers like skill names override them. */
export function slugify(input: string, opts: { maxLen?: number; fallback?: string } = {}): string {
  const { maxLen = 50, fallback = 'task' } = opts
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
  return base || fallback
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

  /** Resolve a ref to its commit SHA within `cwd`. */
  private async revParse(cwd: string, ref: string): Promise<string> {
    return (await runOrThrow(this.runner, 'git', ['-C', cwd, 'rev-parse', ref], { cwd })).trim()
  }

  /**
   * Create the thread's worktree + branch off the default branch. Returns the
   * branch name, worktree path, and the base commit it was created from
   * (`baseSha`) — persisted on the thread as `baseRef`.
   *
   * `startPoint` rehydrates: pass a saved commit SHA to recreate the branch
   * pointing exactly where the thread left off (see ThreadEngine.rehydrateThread).
   * The thread's `baseRef` is recorded as the resolved SHA of the worktree's
   * initial HEAD.
   */
  async create(
    taskId: TaskId,
    slug: string,
    opts: { startPoint?: string } = {},
  ): Promise<{ branch: string; worktreePath: string; baseSha: string }> {
    const branch = this.branchName(slug)
    const path = this.worktreePath(taskId)
    const anchor = opts.startPoint ?? this.defaultBranch
    const add = () =>
      runOrThrow(this.runner, 'git', ['-C', this.repoRoot, 'worktree', 'add', '-b', branch, path, anchor])
    try {
      await add()
    } catch {
      // A prior run force-quit before `closeOut`/`remove` can leave this thread's
      // worktree dir + branch behind (thread ids are reused across launches), so
      // `add` fails with "already exists". Drop the stale remnants and retry once
      // — the thread's prior work is preserved out-of-band (snapshot tag +
      // `startPoint`/`lastSeenHead`), so a forced re-create is safe.
      await this.dropWorktree(path, branch)
      await add()
    }
    return { branch, worktreePath: path, baseSha: await this.revParse(path, 'HEAD') }
  }

  /**
   * Best-effort teardown of a worktree's on-disk dir and (optionally) its branch
   * ref. Idempotent — a missing worktree/branch/dir is a no-op, never an error —
   * so it's safe as both routine GC (`remove`/`closeOut`) and stale-remnant
   * recovery (`create`). Covers all three forms a leftover can take: a registered
   * worktree (`worktree remove`), an unregistered dir already gone from git's
   * metadata (`rmSync` + `prune`), and a dangling branch ref (`branch -D`).
   */
  private async dropWorktree(worktreePath: string, branch?: string): Promise<void> {
    await this.runner
      .run('git', ['-C', this.repoRoot, 'worktree', 'remove', '--force', worktreePath])
      .catch(() => {})
    // `worktree remove` only handles dirs git still tracks; one already pruned
    // from git's metadata stays on disk and would still collide with `add`.
    rmSync(worktreePath, { recursive: true, force: true })
    await this.runner.run('git', ['-C', this.repoRoot, 'worktree', 'prune']).catch(() => {})
    if (branch) await this.runner.run('git', ['-C', this.repoRoot, 'branch', '-D', branch]).catch(() => {})
  }

  /** GC the worktree on merge/abandon. Best-effort; prunes stale refs. */
  async remove(taskId: TaskId): Promise<void> {
    await this.dropWorktree(this.worktreePath(taskId))
  }

  /**
   * Close a thread: snapshot its dirty worktree as a single commit so drafts
   * aren't lost, capture the resulting branch tip as `lastSeenHead`, drop the
   * worktree dir, delete the branch ref, and stamp an insurance tag so an
   * aggressive `git gc --prune=now` between close and rehydrate can't sweep
   * the relevant commits out of object storage.
   *
   * Cleanup is fully best-effort: every git op is wrapped so a missing worktree,
   * a missing branch, or a transient git error never leaks refs into the user's
   * repo. Returns the captured SHA, or null when nothing was on disk to snapshot.
   */
  async closeOut(taskId: TaskId, opts: {
    branch: string
    worktreePath: string
    /** Slug used as fallback for the WIP commit message; passed by the engine. */
    wipTitle: string
  }): Promise<string | null> {
    const { branch, worktreePath, wipTitle } = opts
    // 1. Auto-commit any dirty working tree so drafts aren't lost on close.
    //    Best-effort: if the commit fails (no user.name/email, hook fails, …)
    //    we proceed to capture the SHA anyway — the user already had whatever
    //    state was committed before this turn.
    await this.runner
      .run('git', ['-C', worktreePath, 'add', '-A'], { cwd: worktreePath })
      .catch(() => undefined)
    await this.runner
      .run(
        'git',
        ['-C', worktreePath, 'commit', '--allow-empty', '-m', `WIP: ${wipTitle}`],
        { cwd: worktreePath },
      )
      .catch(() => undefined)

    // 2. Capture the branch tip. This is what we'll rehydrate to. If the
    //    branch is already gone (a prior close raced and won), we still
    //    need to make sure no worktree/branch refs are left dangling.
    let sha: string | null = null
    try {
      sha = (await runOrThrow(this.runner, 'git', ['-C', this.repoRoot, 'rev-parse', branch])).trim()
    } catch {
      sha = null
    }

    // 3. Insurance tag — protected by default gc, so the rehydrate target
    //    survives a `git gc --prune=now` between close and reopen. Use `-f`
    //    so a re-close (different SHA from the same thread id) overwrites
    //    the previous snapshot rather than erroring; the DB is authoritative
    //    so a stale tag is harmless, but a missing tag would be worse.
    if (sha) {
      await this.runner
        .run('git', ['-C', this.repoRoot, 'tag', '-f', `freebuff-snapshot/${taskId}`, sha])
        .catch(() => undefined)
    }

    // 4. Drop the worktree dir and the branch ref (idempotent / best-effort).
    await this.dropWorktree(worktreePath, branch)

    return sha
  }
}
