/**
 * The worktree, and the three facts the sandbox grant is derived from
 * (COD-339).
 *
 * Every git call is injected, so what is tested is the SEQUENCE and the shape
 * of what comes back rather than git itself. The one thing worth being careful
 * about here is `linked`: those three fields become write grants on the user's
 * REAL `.git`, and a wrong `gitDir` grants the wrong directory.
 */
import { describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

ensureCliTestEnv()

const {
  createSponsoredWorktree,
  gitdirUnmoved,
  removeSponsoredWorktree,
  sponsoredBranchFor,
  sponsoredHead,
  sponsoredRuntimeDir,
  sponsoredWorktreePath,
} = await import('../sponsored-worktree')

import type { GitResult, GitRunner } from '../sponsored-worktree'

const ROOT = '/repo'
const RUN = 'run-1'

function runner(
  answers: Array<[string, Partial<GitResult>]>,
  calls: string[][] = [],
): GitRunner {
  return async (args) => {
    calls.push(args)
    const key = args.join(' ')
    for (const [match, result] of answers) {
      if (key.includes(match)) {
        return { exitCode: 0, stdout: '', stderr: '', ...result }
      }
    }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
}

const HAPPY: Array<[string, Partial<GitResult>]> = [
  ['symbolic-ref', { stdout: 'main\n' }],
  ['--git-common-dir', { stdout: '/repo/.git\n' }],
  ['--git-dir', { stdout: '/repo/.git/worktrees/run-1\n' }],
  ['rev-parse HEAD', { stdout: 'base-sha\n' }],
]

describe('creating the workspace', () => {
  test('cuts the named branch off the branch the user is on', async () => {
    const calls: string[][] = []
    const worktree = await createSponsoredWorktree(
      ROOT,
      RUN,
      'Sponsored: Acme Deploys',
      runner(HAPPY, calls),
    )
    expect(worktree.branch).toBe(sponsoredBranchFor('Sponsored: Acme Deploys', RUN))
    expect(worktree.path).toBe(sponsoredWorktreePath(ROOT, RUN))
    expect(worktree.baseRef).toBe('base-sha')
    // Off the branch the user was looking at when they accepted, which is also
    // the base of any pull request the run's work becomes.
    expect(worktree.sourceBranch).toBe('main')
    const add = calls.find((c) => c.includes('add'))!
    expect(add).toContain('main')
  })

  test('the grant inputs are ASKED FOR, never reconstructed', async () => {
    // git names a worktree's admin directory after the path's basename and
    // disambiguates a collision by appending to it, so deriving it from the run
    // id is right until two projects produce the same basename — and then it
    // silently grants the wrong directory of the user's real `.git`.
    const worktree = await createSponsoredWorktree(
      ROOT,
      RUN,
      'Sponsored: Acme',
      // First match wins, so the override goes ahead of the happy answers.
      runner([
        ['--git-dir', { stdout: '/repo/.git/worktrees/run-11\n' }],
        ...HAPPY,
      ]),
    )
    expect(worktree.linked.gitDir).toBe('/repo/.git/worktrees/run-11')
    expect(worktree.linked.commonDir).toBe('/repo/.git')
    // The one ref namespace the sandbox grants write to, shared with Desktop.
    expect(worktree.linked.branchNamespace).toBe('freebuff')
  })

  test('a failed add is retried once, after clearing the remnants', async () => {
    // A run force-quit before its workspace was removed leaves the directory
    // and the branch behind, so `add` fails with "already exists".
    const calls: string[][] = []
    let adds = 0
    const git: GitRunner = async (args) => {
      calls.push(args)
      const key = args.join(' ')
      if (key.includes('worktree add')) {
        return adds++ === 0
          ? { exitCode: 128, stdout: '', stderr: 'already exists\n' }
          : { exitCode: 0, stdout: '', stderr: '' }
      }
      for (const [match, result] of HAPPY) {
        if (key.includes(match)) {
          return { exitCode: 0, stdout: '', stderr: '', ...result }
        }
      }
      return { exitCode: 0, stdout: '', stderr: '' }
    }
    const worktree = await createSponsoredWorktree(ROOT, RUN, 'Sponsored: Acme', git)
    expect(worktree.branch).toContain(RUN)
    expect(adds).toBe(2)
    expect(calls.some((c) => c.includes('remove'))).toBe(true)
  })

  test('a workspace whose git directories cannot be resolved is REFUSED and cleaned up', async () => {
    // Without them the run cannot run git at all, so this is a refusal rather
    // than a run started with a narrower sandbox than intended — and a worktree
    // nothing can use is only a thing for the user to wonder about.
    const calls: string[][] = []
    await expect(
      createSponsoredWorktree(
        ROOT,
        RUN,
        'Sponsored: Acme',
        runner(
          [['--git-common-dir', { exitCode: 128, stdout: '' }], ...HAPPY],
          calls,
        ),
      ),
    ).rejects.toThrow()
    expect(calls.some((c) => c.includes('remove'))).toBe(true)
  })
})

describe('removing it', () => {
  test('drops the worktree, prunes, and deletes the branch', async () => {
    const calls: string[][] = []
    await removeSponsoredWorktree(ROOT, RUN, 'freebuff/x', runner(HAPPY, calls))
    const joined = calls.map((c) => c.join(' '))
    expect(joined.some((c) => c.includes('worktree remove'))).toBe(true)
    expect(joined.some((c) => c.includes('worktree prune'))).toBe(true)
    expect(joined.some((c) => c.includes('branch -D'))).toBe(true)
  })

  test('takes the run’s private HOME with it', () => {
    // Outside the worktree by design, so nothing the run's tooling drops in
    // HOME can appear in the diff the user reviews.
    const runtime = sponsoredRuntimeDir(ROOT, RUN)
    expect(runtime).toContain('.freebuff')
    expect(runtime).not.toContain(sponsoredWorktreePath(ROOT, RUN))
  })
})

describe('the head, and why there isn’t one', () => {
  const exists = () => true

  test('names each of the four ways it can be absent', async () => {
    expect(await sponsoredHead(null, 'base', runner(HAPPY), exists)).toMatchObject({
      head: null,
    })
    expect(
      (await sponsoredHead('/gone', 'base', runner(HAPPY), () => false)).diagnostic,
    ).toContain('no longer on disk')
    expect(
      (
        await sponsoredHead(
          '/w',
          'base',
          runner([['rev-parse HEAD', { exitCode: 128, stderr: 'fatal: bad\n' }]]),
          exists,
        )
      ).diagnostic,
    ).toContain('fatal: bad')
    expect(
      (
        await sponsoredHead(
          '/w',
          'base',
          runner([['rev-parse HEAD', { stdout: '\n' }]]),
          exists,
        )
      ).diagnostic,
    ).toContain('printed nothing')
  })

  test('distinguishes "did nothing" from "could not be asked"', async () => {
    // Both reach the card as the same sentence and they are entirely different
    // bugs: the first is a run that did not do the work, the second is how a
    // broken toolchain looks.
    const idle = await sponsoredHead(
      '/w',
      'base-sha',
      runner([['rev-parse HEAD', { stdout: 'base-sha\n' }]]),
      exists,
    )
    expect(idle.diagnostic).toContain('still the base commit')
    const moved = await sponsoredHead(
      '/w',
      'base-sha',
      runner([['rev-parse HEAD', { stdout: 'new-sha\n' }]]),
      exists,
    )
    expect(moved.diagnostic).toContain('moved off the base')
  })
})

describe('the gitdir pointer', () => {
  test('agrees only when both sides resolve the same common dir', async () => {
    // `<worktree>/.git` is a FILE inside a directory the sandbox lets the run
    // write, so it can be pointed at a repository of the run's own — with its
    // own remote and its own hooks.
    expect(await gitdirUnmoved(ROOT, '/w', runner(HAPPY))).toBe(true)
    let asked = 0
    const moved: GitRunner = async (args) =>
      args.join(' ').includes('--git-common-dir')
        ? {
            exitCode: 0,
            stdout: asked++ === 0 ? '/repo/.git\n' : '/elsewhere/.git\n',
            stderr: '',
          }
        : { exitCode: 0, stdout: '', stderr: '' }
    expect(await gitdirUnmoved(ROOT, '/w', moved)).toBe(false)
  })

  test('a git that cannot answer is NOT taken as agreement', async () => {
    expect(
      await gitdirUnmoved(
        ROOT,
        '/w',
        runner([['--git-common-dir', { exitCode: 128, stdout: '' }]]),
      ),
    ).toBe(false)
  })
})
