/**
 * The isolated checkout a local sponsored run works in (COD-339).
 *
 * A LINKED WORKTREE under `<project>/.freebuff/worktrees/<runId>`, on
 * `freebuff/<slug>-<runId>`, cut off whatever branch the user is on. The same
 * layout Desktop creates, deliberately: a user with both installed sees one
 * convention, and the SDK sandbox's linked-worktree grant is written for
 * exactly this shape.
 *
 * ## Why a linked worktree and not a clone (#2725, and it was measured)
 *
 * A `git clone --local` puts a real `.git` directory inside the workspace, so
 * the sandbox root is self-contained and no grant on the user's repository is
 * needed at all. It looks strictly better from the sandbox side and it was
 * REJECTED, for three reasons that are invisible from there:
 *
 *  1. It MOVES the RCE hole rather than closing it. The clone's `.git` sits
 *     inside `workspaceRoot`, which is a sandbox WRITE root — so `config` and
 *     `hooks/` become advertiser-writable, and every unsandboxed `git -C
 *     <workspace>` we run afterwards executes them as the user.
 *  2. Delivery breaks. `origin` in a local clone is a filesystem path, so
 *     `git push origin` and `gh pr create` target the wrong place — and
 *     `origin` would itself be advertiser-writable, on the one command that
 *     carries the user's real push credentials.
 *  3. `remove` becomes silent data loss. Today the run's commits survive a
 *     removal because they live on a branch in the user's shared object store;
 *     in a clone they exist ONLY inside the deleted directory, and removing the
 *     workspace is the ordinary thing to do after a failed run.
 *
 * `--local` WITH hardlinks was rejected separately and on measurement: the
 * clone's pack file is the same inode as the user's, so a write inside the
 * run's own allowlist reaches the user's repository.
 *
 * So the linked worktree stays, and the five narrow git-dir grants
 * (`worktrees/<id>`, `objects`, `refs/heads/freebuff`,
 * `logs/refs/heads/freebuff`, and the `packed-refs.lock` literal) are what make
 * git work inside it. This module's job is to hand the SDK the three facts
 * those grants are derived from — and never the paths themselves, which is why
 * {@link SponsoredLinkedWorktree} is the shape the SDK asks for.
 */
import {
  SPONSORED_LOCAL_BRANCH_NAMESPACE,
  sponsoredLocalBranchName,
} from '@codebuff/common/ads/sponsored-local-execution'
import { existsSync, realpathSync, rmSync } from 'fs'
import { isAbsolute, join } from 'path'

import { logger } from './logger'

import type { SponsoredLinkedWorktree } from '../../../sdk/src/tools/sponsored-sandbox'

export type GitResult = { exitCode: number; stdout: string; stderr: string }
/** One git invocation. Injected so every path below is testable without one. */
export type GitRunner = (args: string[], cwd?: string) => Promise<GitResult>

const GIT_TIMEOUT_MS = 60_000

export const bunGitRunner: GitRunner = async (args, cwd) => {
  try {
    const proc = Bun.spawn(['git', ...args], {
      ...(cwd ? { cwd } : {}),
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(GIT_TIMEOUT_MS),
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return { exitCode, stdout, stderr }
  } catch (error) {
    // A THROW IS A RESULT, not an exception to propagate. `git` missing from
    // PATH and `git` exiting 128 are the same thing to every caller here, and
    // the message is the most useful string a `diagnostic_reason` can carry.
    return {
      exitCode: -1,
      stdout: '',
      stderr: `git could not be run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

export type SponsoredWorktree = {
  /** `<project>/.freebuff/worktrees/<runId>`. */
  path: string
  branch: string
  /** The commit the branch was cut at. `committed` is "HEAD moved off this". */
  baseRef: string
  /** The branch the run was cut FROM, and the base of any pull request. */
  sourceBranch: string
  /** What the SDK derives the five git-dir grants from. */
  linked: SponsoredLinkedWorktree
}

export function sponsoredWorktreePath(projectRoot: string, runId: string): string {
  return join(projectRoot, '.freebuff', 'worktrees', runId)
}

/**
 * The run's private `HOME`/`TMPDIR`, OUTSIDE the worktree.
 *
 * Outside deliberately: a `.gitconfig` or a cache the run's tooling drops in
 * its HOME must not appear in the diff the user is asked to review, and must
 * not be one `git add -A` away from the branch.
 */
export function sponsoredRuntimeDir(projectRoot: string, runId: string): string {
  return join(projectRoot, '.freebuff', 'sponsored-runtime', runId)
}

/** The branch a run will be given, computable before anything is created. */
export function sponsoredBranchFor(title: string, runId: string): string {
  return sponsoredLocalBranchName(title, runId)
}

/**
 * Is this folder a git repository at all?
 *
 * Asked of git rather than by looking for a `.git` entry, because the project
 * root may itself be a linked worktree (which is how this repository's own dev
 * slots are laid out) and then `.git` is a file.
 */
export async function isGitRepository(
  projectRoot: string,
  git: GitRunner = bunGitRunner,
): Promise<boolean> {
  const result = await git(['-C', projectRoot, 'rev-parse', '--is-inside-work-tree'])
  return result.exitCode === 0 && result.stdout.trim() === 'true'
}

/** The branch the user is on, or null when HEAD is detached. */
export async function currentBranch(
  projectRoot: string,
  git: GitRunner = bunGitRunner,
): Promise<string | null> {
  const result = await git(['-C', projectRoot, 'symbolic-ref', '--short', 'HEAD'])
  const value = result.stdout.trim()
  return result.exitCode === 0 && value ? value : null
}

async function absoluteGitPath(
  cwd: string,
  which: '--git-common-dir' | '--git-dir',
  git: GitRunner,
): Promise<string | null> {
  const result = await git([
    '-C',
    cwd,
    'rev-parse',
    '--path-format=absolute',
    which,
  ])
  const value = result.stdout.trim()
  if (result.exitCode !== 0 || !value) return null
  return isAbsolute(value) ? value : join(cwd, value)
}

/**
 * Create the run's worktree.
 *
 * The `gitDir` is ASKED FOR rather than reconstructed from the run id: git
 * names a worktree's admin directory after the path's basename and
 * disambiguates a collision by appending to it, so deriving it is right until
 * two projects produce the same basename and then silently grants the wrong
 * directory.
 */
export async function createSponsoredWorktree(
  projectRoot: string,
  runId: string,
  title: string,
  git: GitRunner = bunGitRunner,
): Promise<SponsoredWorktree> {
  const branch = sponsoredBranchFor(title, runId)
  const path = sponsoredWorktreePath(projectRoot, runId)
  const sourceBranch = (await currentBranch(projectRoot, git)) ?? 'HEAD'

  const add = () =>
    git(['-C', projectRoot, 'worktree', 'add', '-b', branch, path, sourceBranch])
  let created = await add()
  if (created.exitCode !== 0) {
    // A run that was force-quit before its workspace was removed leaves the
    // directory and the branch behind, so `add` fails with "already exists".
    // Drop both and try once more; nothing is lost, because a previous run's
    // commits live on a branch in the shared object store and this only
    // reaches a branch named for THIS run id.
    await removeSponsoredWorktree(projectRoot, runId, branch, git)
    created = await add()
  }
  if (created.exitCode !== 0) {
    throw new Error(
      firstLine(created.stderr) || 'Could not create a workspace for the sponsored task.',
    )
  }

  const [commonDir, gitDir, head] = await Promise.all([
    absoluteGitPath(path, '--git-common-dir', git),
    absoluteGitPath(path, '--git-dir', git),
    git(['-C', path, 'rev-parse', 'HEAD']),
  ])
  if (!commonDir || !gitDir) {
    // WITHOUT THESE THE RUN CANNOT RUN GIT AT ALL, so this is a refusal rather
    // than a run started with a narrower sandbox than intended. Clean up: a
    // worktree nothing can use is only a thing for the user to wonder about.
    await removeSponsoredWorktree(projectRoot, runId, branch, git)
    throw new Error('Could not resolve the workspace’s git directories.')
  }

  return {
    path,
    branch,
    baseRef: head.stdout.trim(),
    sourceBranch,
    linked: {
      commonDir: canonical(commonDir),
      gitDir: canonical(gitDir),
      branchNamespace: SPONSORED_LOCAL_BRANCH_NAMESPACE,
    },
  }
}

/**
 * Remove the worktree and its branch. Idempotent: a missing worktree, branch or
 * directory is a no-op rather than an error, so this serves both the user's
 * "remove it" and the recovery inside `create`.
 */
export async function removeSponsoredWorktree(
  projectRoot: string,
  runId: string,
  branch: string | null,
  git: GitRunner = bunGitRunner,
): Promise<void> {
  const path = sponsoredWorktreePath(projectRoot, runId)
  await git(['-C', projectRoot, 'worktree', 'remove', '--force', path])
  // `worktree remove` only handles directories git still tracks; one already
  // pruned from git's metadata stays on disk and would still collide with a
  // later `add`.
  rmSync(path, { recursive: true, force: true })
  rmSync(sponsoredRuntimeDir(projectRoot, runId), { recursive: true, force: true })
  await git(['-C', projectRoot, 'worktree', 'prune'])
  if (branch) {
    await git(['-C', projectRoot, 'branch', '-D', '--', branch])
  }
}

/**
 * The branch tip, AND why there isn't one.
 *
 * The verdict only needs the head; the diagnostic needs all four ways it can be
 * absent, because "the worktree is gone" and "`git rev-parse` exited non-zero"
 * are the two ends of the range between a user who deleted a folder and a
 * toolchain that cannot run at all. git's own stderr is carried through
 * verbatim and capped — it is the most useful string in the whole report.
 */
export async function sponsoredHead(
  worktreePath: string | null,
  baseRef: string | null,
  git: GitRunner = bunGitRunner,
  // Injected alongside `git` so the whole verdict is testable without a
  // checkout on disk. A test that had to create one would be testing `git
  // worktree add` rather than the decision this function makes.
  exists: (path: string) => boolean = existsSync,
): Promise<{ head: string | null; diagnostic: string }> {
  if (!worktreePath) return { head: null, diagnostic: 'no worktree path on the run' }
  if (!exists(worktreePath)) {
    return { head: null, diagnostic: 'worktree no longer on disk' }
  }
  const result = await git(['-C', worktreePath, 'rev-parse', 'HEAD'])
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(0, 300)
    return {
      head: null,
      diagnostic: `git rev-parse HEAD exited ${result.exitCode}${detail ? `: ${detail}` : ''}`,
    }
  }
  const head = result.stdout.trim()
  if (!head) return { head: null, diagnostic: 'git rev-parse HEAD printed nothing' }
  return {
    head,
    diagnostic:
      head === baseRef
        ? 'HEAD is still the base commit; nothing was committed'
        : 'HEAD moved off the base commit',
  }
}

/**
 * Does this worktree still belong to the repository we created it in?
 *
 * `<worktree>/.git` is a FILE inside the worktree saying where the real gitdir
 * is, and the sandbox permits writing anywhere in the worktree — so a run can
 * point it at a repository of its own, with its own remote and its own hooks,
 * and a push would go there. Verified immediately before the push.
 *
 * Compares the git COMMON dir both sides resolve to, rather than testing the
 * layout of that file: git owns the format, and a nested checkout or a
 * repointed `GIT_DIR` should be answered by git itself.
 */
export async function gitdirUnmoved(
  projectRoot: string,
  worktreePath: string,
  git: GitRunner = bunGitRunner,
): Promise<boolean> {
  const [project, worktree] = await Promise.all([
    absoluteGitPath(projectRoot, '--git-common-dir', git),
    absoluteGitPath(worktreePath, '--git-common-dir', git),
  ])
  if (project === null || worktree === null) return false
  return canonical(project) === canonical(worktree)
}

function canonical(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    logger.debug({ path }, '[sponsored-run] could not realpath a git directory')
    return path
  }
}

export function firstLine(text: string): string {
  return text.trim().split('\n', 1)[0] ?? ''
}
