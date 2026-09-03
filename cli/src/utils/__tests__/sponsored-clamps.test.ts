/**
 * The boundary, asserted directly rather than only through a live run.
 *
 * Every entry in `sponsoredOverrideTools` is a containment control, and a
 * control that is only ever exercised end-to-end is a control nobody tests. The
 * finding these exist for is COD-397's F1: the OS sandbox is a
 * `TerminalCommandBroker`, so it covers `run_terminal_command` and NOTHING
 * else. `read_files`, `code_search`, `list_directory` and `glob` run in the
 * CLI's own process, as the user, and the SDK honours an absolute path — so a
 * procedure with no shell command at all could read `~/.ssh/id_rsa` and hand it
 * to the granted `read_url`.
 */
import { describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'

ensureCliTestEnv()

const { sponsoredOverrideTools, sponsoredReadGuard, sponsoredWriteGuard } =
  await import('../sponsored-run')
const { sponsoredAgentDefinition } = await import('../sponsored-agent')
const { SPONSORED_LOCAL_V1_GRANT } = await import(
  '@codebuff/common/ads/sponsored-local-execution'
)
const { sponsoredCapabilityForTool } = await import(
  '@codebuff/common/ads/sponsored-capabilities'
)

import type { SponsoredTurnContext } from '../sponsored-run'

const WORKTREE = '/repo/.freebuff/worktrees/run-1'

const context = (): SponsoredTurnContext => ({
  prompt: 'do the thing',
  proposalId: 'proposal-1',
  runtimeDir: '/repo/.freebuff/sponsored-runtime/run-1',
  signal: new AbortController().signal,
  worktree: {
    path: WORKTREE,
    branch: 'freebuff/sponsored-acme-run-1',
    baseRef: 'base',
    sourceBranch: 'main',
    linked: {
      commonDir: '/repo/.git',
      gitDir: '/repo/.git/worktrees/run-1',
      branchNamespace: 'freebuff',
    },
  },
})

/** Paths a procedure would reach for if the clamp were not there. */
const OUTSIDE = [
  '/Users/owen/.ssh/id_rsa',
  '/etc/passwd',
  '../../../etc/hosts',
  '~/.aws/credentials',
  '/repo/.env',
]

describe('the read clamp', () => {
  test('refuses every path outside the worktree, by name', () => {
    for (const path of OUTSIDE) {
      const refused = sponsoredReadGuard(WORKTREE, path)
      expect(refused, path).not.toBeNull()
    }
  })

  test('admits the worktree’s own files', () => {
    for (const path of ['src/index.ts', `${WORKTREE}/package.json`, './README.md']) {
      expect(sponsoredReadGuard(WORKTREE, path), path).toBeNull()
    }
  })

  test('`~` is REFUSED rather than expanded', () => {
    // `path.resolve` has never heard of a tilde, so `~/.ssh/id_rsa` used to
    // come back as `<worktree>/~/.ssh/id_rsa` and PASS — an allow at the exact
    // spelling every reader of that function expects to see refused.
    expect(sponsoredReadGuard(WORKTREE, '~/.ssh/id_rsa')).not.toBeNull()
    expect(sponsoredWriteGuard(WORKTREE, '~/.bashrc')).not.toBeNull()
  })

  test('an absent path is not an error, but an empty one is', () => {
    // Absent means the tool was not given a cwd, which is the ordinary case.
    expect(sponsoredReadGuard(WORKTREE, undefined)).toBeNull()
    expect(sponsoredReadGuard(WORKTREE, '   ')).not.toBeNull()
  })

  test('read_files answers a refused path IN THE SLOT the content would occupy', async () => {
    // `getFiles` answers a missing file with a status string in exactly this
    // shape, so the run reads a sentence rather than an absence and does not
    // retry the same path three more ways.
    const tools = sponsoredOverrideTools(context())
    const out = await tools.read_files({ filePaths: ['/etc/passwd'] })
    expect(typeof out['/etc/passwd']).toBe('string')
    expect(out['/etc/passwd']).not.toBe(null)
  })

  test('every read-shaped tool has a clamp, including glob', async () => {
    // `glob` is contained by construction today. It is clamped anyway, so a
    // future implementation that resolves `cwd` cannot widen the boundary
    // silently.
    const tools = sponsoredOverrideTools(context())
    for (const name of ['code_search', 'list_directory', 'glob'] as const) {
      expect(typeof tools[name], name).toBe('function')
    }
    const refused = await tools.glob({ pattern: '**/*', cwd: '/etc' })
    expect(JSON.stringify(refused)).toContain('errorMessage')
  })
})

describe('the write guard', () => {
  test('refuses the path classes a pull request would never show', () => {
    // `.git` internals never reach the diff at all; a tracked hook directory
    // executes on the REVIEWER'S machine the moment they check the branch out.
    for (const path of [
      '.git/hooks/pre-commit',
      '.git/config',
      '.github/workflows/ci.yml',
      '.husky/pre-commit',
      '.npmrc',
      '.netrc',
    ]) {
      expect(sponsoredWriteGuard(WORKTREE, path), path).not.toBeNull()
    }
  })

  test('refuses a write outside the worktree, and an unnamed one', () => {
    for (const path of OUTSIDE) {
      expect(sponsoredWriteGuard(WORKTREE, path), path).not.toBeNull()
    }
    expect(sponsoredWriteGuard(WORKTREE, null)).not.toBeNull()
  })

  test('admits an ordinary source edit', () => {
    expect(sponsoredWriteGuard(WORKTREE, 'src/deploy.ts')).toBeNull()
  })
})

describe('the shell', () => {
  test('installs are refused, and the refusal says it is a product decision', async () => {
    // A postinstall script runs outside the tool loop entirely, so a run that
    // installs is a run whose diff the user cannot review (COD-336 item 5).
    const tools = sponsoredOverrideTools(context())
    for (const command of ['npm install left-pad', 'bun add x', 'pip3 install y']) {
      const result = await tools.run_terminal_command({ command })
      expect(JSON.stringify(result), command).toContain('Refusing to install')
    }
  })
})

describe('the toolset the run is actually offered', () => {
  test('every tool the definition offers is one the grant admits', () => {
    // The narrowing is what makes `ask_user`, `suggest_followups`, `render_ui`
    // and `skill` unreachable: three of the four are not client-executed at
    // all, so no `overrideTools` handler is ever consulted for them and the
    // toolNames of the definition are the only place they can be removed.
    const definition = sponsoredAgentDefinition({
      agentId: 'base3',
      isFreebuff: true,
    })
    expect(definition.toolNames?.length).toBeGreaterThan(0)
    for (const tool of definition.toolNames ?? []) {
      const capability = sponsoredCapabilityForTool(tool)
      expect(capability, tool).toBeDefined()
      expect(SPONSORED_LOCAL_V1_GRANT.has(capability!), tool).toBe(true)
    }
  })

  test('the four tools the CLI root adds beyond the grant are gone', () => {
    const definition = sponsoredAgentDefinition({
      agentId: 'base3',
      isFreebuff: true,
    })
    for (const tool of ['ask_user', 'suggest_followups', 'render_ui', 'skill']) {
      expect(definition.toolNames, tool).not.toContain(tool)
    }
    // And the ones a sponsored run genuinely needs are still there.
    for (const tool of ['read_files', 'write_file', 'run_terminal_command']) {
      expect(definition.toolNames, tool).toContain(tool)
    }
  })

  test('the system prompt is APPENDED to, never prepended', () => {
    // `hasFreebuffRootSystemPromptOpening` requires the canonical opening at
    // byte 0 and 403s every free-mode turn without it
    // (docs/freebuff-base3-harness.md).
    const plain = sponsoredAgentDefinition({ agentId: 'base3', isFreebuff: true })
    expect(plain.systemPrompt?.startsWith('You are Buffy')).toBe(true)
    expect(plain.systemPrompt).toContain('Do NOT push')
  })

  test('it keeps the id it was given, so free mode can still admit it', () => {
    // Free mode gates on the (agent id, model) pair, so a run started under an
    // invented id is a run that cannot be admitted at all.
    expect(
      sponsoredAgentDefinition({ agentId: 'base3-free-mimo', isFreebuff: true }).id,
    ).toBe('base3-free-mimo')
  })
})
