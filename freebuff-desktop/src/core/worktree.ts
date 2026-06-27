/**
 * Worktree manager (§6.1). One git worktree per active task under
 * `<project>/.freebuff/worktrees/<task-id>`, each on branch `freebuff/<task-slug>`,
 * branched from the default branch. An **independent** task sees only `main`'s work.
 * A **dependent** that starts before its parents merge (§8) is created off `main` and
 * then has its unmerged parents' branches merged in (`mergeParentBranches`), so it
 * builds on their not-yet-landed code. When a parent's tip later moves or merges, the
 * child is **restacked** (`restack`) onto a fresh `integrationBaseSha` so only the
 * child's own commits are replayed.
 *
 * V1 shells out to the user's local `git` + `gh` (§6.3). All git invocations go
 * through an injectable `CommandRunner` so this is testable against a real temp repo.
 */

import { rmSync } from 'fs'
import { join } from 'path'

import { bunRunner, runOrThrow, type CommandRunner } from './exec'

/** A worktree is keyed by an opaque id (a thread id in the thread model). */
type TaskId = string

export const BRANCH_PREFIX = 'freebuff/'

/** Turn a string into a stable, filesystem/branch-safe slug. Defaults suit task
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

  /** Resolve a ref to its commit SHA within `cwd`. */
  private async revParse(cwd: string, ref: string): Promise<string> {
    return (await runOrThrow(this.runner, 'git', ['-C', cwd, 'rev-parse', ref], { cwd })).trim()
  }

  /**
   * Merge each branch into the working tree at `cwd` in turn (§8); on the first
   * conflict, abort and report it. There is no auto-resolving integration agent —
   * conflicts surface to a person.
   */
  private async mergeAllOrAbort(cwd: string, branches: string[]): Promise<RebaseResult> {
    for (const branch of branches) {
      const merge = await this.runner.run('git', ['-C', cwd, 'merge', '--no-edit', branch], { cwd })
      if (merge.exitCode !== 0) {
        await this.runner.run('git', ['-C', cwd, 'merge', '--abort'], { cwd }).catch(() => {})
        return { clean: false, detail: merge.stderr.trim() || merge.stdout.trim() }
      }
    }
    return { clean: true }
  }

  /**
   * Create the task's worktree + branch off the default branch. Returns the branch
   * name, worktree path, and the base commit it was created from (`baseSha`) — the
   * latter persisted on the task as `baseRef` so a dependent can later be restacked
   * (a dependent then merges its parents' branches in via `mergeParentBranches`).
   *
   * `startPoint` rehydrates: pass a saved commit SHA to recreate the branch
   * pointing exactly where the thread left off (see ThreadEngine.rehydrateThread).
   * The thread's `baseRef` is recorded as the resolved SHA of the worktree's
   * initial HEAD, so dependent restack still works after rehydrate.
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

  /**
   * Merge each parent branch into a freshly-created dependent worktree (§8), so the
   * child builds on its parents' not-yet-merged code. Returns the new HEAD as the
   * child's `baseRef`. On a merge conflict, aborts and reports `clean:false` — there
   * is no auto-resolving integration agent (§8), so the engine blocks the child.
   */
  async mergeParentBranches(
    taskId: TaskId,
    parentBranches: string[],
  ): Promise<RebaseResult & { baseSha?: string }> {
    const cwd = this.worktreePath(taskId)
    const merged = await this.mergeAllOrAbort(cwd, parentBranches)
    if (!merged.clean) return merged
    return { clean: true, baseSha: await this.revParse(cwd, 'HEAD') }
  }

  /**
   * Resolve a fresh integration base for a dependent: the latest default branch with
   * every still-unmerged parent branch merged in (§8). Computed in a throwaway
   * detached worktree so it never disturbs the user's working tree; the returned SHA
   * becomes reachable as soon as the caller rebases the child onto it. On conflict,
   * aborts and reports `clean:false` so the engine blocks the child for a human.
   *
   * With no parent branches it just returns the latest default-branch tip.
   */
  async integrationBaseSha(
    childTaskId: TaskId,
    parentBranches: string[],
  ): Promise<{ baseSha: string; clean: boolean; detail?: string }> {
    if (parentBranches.length === 0) {
      return { baseSha: await this.revParse(this.repoRoot, this.defaultBranch), clean: true }
    }
    const tmp = join(this.repoRoot, '.freebuff', 'worktrees', `_base-${childTaskId}`)
    // Clear any stale base worktree left by a previous attempt, then build fresh.
    await this.runner.run('git', ['-C', this.repoRoot, 'worktree', 'remove', '--force', tmp]).catch(() => {})
    await runOrThrow(this.runner, 'git', ['-C', this.repoRoot, 'worktree', 'add', '--detach', tmp, this.defaultBranch])
    try {
      const merged = await this.mergeAllOrAbort(tmp, parentBranches)
      if (!merged.clean) return { baseSha: '', clean: false, detail: merged.detail }
      return { baseSha: await this.revParse(tmp, 'HEAD'), clean: true }
    } finally {
      await this.runner.run('git', ['-C', this.repoRoot, 'worktree', 'remove', '--force', tmp]).catch(() => {})
      await this.runner.run('git', ['-C', this.repoRoot, 'worktree', 'prune']).catch(() => {})
    }
  }

  /**
   * Restack a dependent's branch onto a new base, replaying only the child's own
   * commits: `git rebase --onto <newBase> <oldBase>` drops everything up to and
   * including `oldBase` (the previous integration base, incl. the parents' merge
   * commits) and reparents the child's commits on `newBase`. Used when a parent's tip
   * moves (re-run) or merges (its squashed content is now on `main`). On conflict,
   * aborts and reports `clean:false`.
   */
  async restack(
    taskId: TaskId,
    newBaseSha: string,
    oldBaseSha: string,
  ): Promise<RebaseResult> {
    const cwd = this.worktreePath(taskId)
    const rebase = await this.runner.run('git', ['-C', cwd, 'rebase', '--onto', newBaseSha, oldBaseSha], { cwd })
    if (rebase.exitCode === 0) return { clean: true }
    await this.runner.run('git', ['-C', cwd, 'rebase', '--abort'], { cwd }).catch(() => {})
    return { clean: false, detail: rebase.stderr.trim() || rebase.stdout.trim() }
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
    return this.resetTo(taskId, this.defaultBranch)
  }

  /**
   * Reset the task's branch + worktree to an arbitrary ref, discarding prior
   * commits/edits. Used when a dependent re-run can't cleanly restack onto its fresh
   * integration base — we start the re-implementation from that base instead (§8).
   */
  async resetTo(taskId: TaskId, ref: string): Promise<void> {
    const cwd = this.worktreePath(taskId)
    await runOrThrow(this.runner, 'git', ['-C', cwd, 'reset', '--hard', ref], { cwd })
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

  /**
   * Fast-forward the local default branch to the remote after a `gh` squash-merge —
   * `gh pr merge` lands the squash on the remote only, so without this the local
   * `main` is stale and dependents restacked off it would miss the just-merged parent
   * (§8). Fetches, then fast-forwards the checked-out default branch.
   */
  async syncDefaultFromRemote(): Promise<void> {
    const root = this.repoRoot
    await runOrThrow(this.runner, 'git', ['-C', root, 'fetch', 'origin', this.defaultBranch])
    await runOrThrow(this.runner, 'git', ['-C', root, 'checkout', this.defaultBranch])
    await runOrThrow(this.runner, 'git', ['-C', root, 'merge', '--ff-only', `origin/${this.defaultBranch}`])
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
