import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  scrubSponsoredLocalEnv,
  sponsoredLocalContainment,
} from '@codebuff/common/ads/sponsored-local-execution'

import {
  assertSponsoredCommandCwd,
  assertSponsoredReadPath,
  assertSponsoredWritePath,
  createSponsoredTerminalBroker,
  sponsoredContainment,
  sponsoredMacProfile,
} from '../tools/sponsored-sandbox'

/**
 * COD-336's two acceptance tests, at the layer that actually holds them.
 *
 * Acceptance 3 asks for "a local run cannot write outside its worktree VIA THE
 * SHELL, not only via the write tools", and acceptance 4 for "the advertiser
 * procedure cannot read the user's environment". Both are properties of the
 * broker, so both are asserted by running a REAL command through it rather
 * than by inspecting the arguments it would have used — an argument list is a
 * thing that can be right while the sandbox is not applied at all, which is
 * exactly how the macOS profile stayed broken for months.
 */

/**
 * Some hosts cannot start a nested OS sandbox at all — Codex's own parent
 * Seatbelt profile rejects `sandbox-exec`, and a minimal Linux runner may have
 * no `bwrap`. Those SKIP; a profile broken on our side must stay red, which is
 * why this probes a PERMISSIVE profile rather than matching failure text.
 */
function containmentUsable(): boolean {
  if (process.platform === 'darwin') {
    return (
      spawnSync('/usr/bin/sandbox-exec', [
        '-p',
        '(version 1)(allow default)',
        '/usr/bin/true',
      ]).status === 0
    )
  }
  if (process.platform === 'linux') return sponsoredContainment().available
  return false
}

function workspace(): { root: string; runtime: string; parent: string } {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sponsored-sandbox-'))
  const root = path.join(parent, 'worktree')
  const runtime = path.join(parent, 'runtime')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(runtime, { recursive: true })
  return { root, runtime, parent }
}

async function drain(stream: NodeJS.ReadableStream): Promise<string> {
  let out = ''
  for await (const chunk of stream) out += String(chunk)
  return out
}

/** The user's environment as a sponsored run must never see it. */
const POLLUTED_ENV = {
  PATH: process.env.PATH,
  HOME: os.homedir(),
  AWS_SECRET_ACCESS_KEY: 'aws-secret-value',
  GITHUB_TOKEN: 'gh-token-value',
  CODEBUFF_API_KEY: 'codebuff-key-value',
  NPM_TOKEN: 'npm-token-value',
  DATABASE_URL: 'postgresql://production',
}

describe('sponsored local environment (COD-336 acceptance 4)', () => {
  it('carries only the allowlist, with HOME redirected', () => {
    const env = scrubSponsoredLocalEnv(POLLUTED_ENV, {
      home: '/run/home',
      tmp: '/run/tmp',
    })
    expect(env.PATH).toBe(POLLUTED_ENV.PATH!)
    expect(env.HOME).toBe('/run/home')
    expect(env.USERPROFILE).toBe('/run/home')
    expect(env.TMPDIR).toBe('/run/tmp')
    expect(env.GIT_ASKPASS).toBe('echo')
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })

  it('carries no credential-shaped variable at all', () => {
    const env = scrubSponsoredLocalEnv(POLLUTED_ENV, {
      home: '/run/home',
      tmp: '/run/tmp',
    })
    for (const key of [
      'AWS_SECRET_ACCESS_KEY',
      'GITHUB_TOKEN',
      'CODEBUFF_API_KEY',
      'NPM_TOKEN',
      'DATABASE_URL',
    ]) {
      expect(env[key]).toBeUndefined()
    }
    // The allowlist is the mechanism; this is the property it exists for, so
    // it is asserted over the whole output rather than over the names above.
    // `GIT_CONFIG_KEY_0` is git's own config-through-environment protocol and
    // is exempt by name, not by pattern: it holds the string `core.hooksPath`,
    // which is what disables hooks for the run.
    expect(
      Object.keys(env).filter(
        (key) =>
          key !== 'GIT_CONFIG_KEY_0' &&
          /(^|_)(TOKEN|SECRET|PASSWORD)$|API_?KEY|ACCESS_?KEY|^AWS_/i.test(key),
      ),
    ).toEqual([])
    expect(env.GIT_CONFIG_KEY_0).toBe('core.hooksPath')
  })

  it('is what a real shell sees, not just what the scrub returns', async () => {
    if (!containmentUsable()) return
    const { root, runtime, parent } = workspace()
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        args: [
          '-c',
          'echo "HOME=$HOME"; echo "AWS=${AWS_SECRET_ACCESS_KEY:-absent}"; echo "GH=${GITHUB_TOKEN:-absent}"',
        ],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stdout = drain(handle.stdout)
      await handle.completion
      const output = await stdout
      expect(output).toContain(`HOME=${path.join(runtime, 'home')}`)
      expect(output).toContain('AWS=absent')
      expect(output).toContain('GH=absent')
      expect(output).not.toContain('aws-secret-value')
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('sponsored write containment (COD-336 acceptance 3)', () => {
  it('refuses a cwd outside the worktree', () => {
    const root = path.resolve('/tmp/sponsored-worktree')
    expect(() =>
      assertSponsoredCommandCwd(root, path.join(root, 'src')),
    ).not.toThrow()
    expect(() => assertSponsoredCommandCwd(root, '/tmp/elsewhere')).toThrow(
      /inside its own worktree/,
    )
  })

  it('refuses a lexical escape and a symlinked one', () => {
    const { root, parent } = workspace()
    const outside = path.join(parent, 'outside')
    fs.mkdirSync(outside, { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'escape'))
    try {
      expect(() => assertSponsoredWritePath(root, 'src/file.ts')).not.toThrow()
      expect(() => assertSponsoredWritePath(root, '../outside/file.ts')).toThrow(
        /inside its own worktree/,
      )
      expect(() => assertSponsoredWritePath(root, 'escape/file.ts')).toThrow(
        /symlink/,
      )
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('stops a SHELL redirect outside the worktree, which no path table can', async () => {
    if (!containmentUsable()) return
    const { root, runtime, parent } = workspace()
    const target = path.join(parent, 'escaped.txt')
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        // The exact bypass COD-175's acceptance 6 was struck for: a redirect
        // never consults `evaluateSponsoredWritePath`, because that table is
        // only reached by write_file / str_replace / apply_patch.
        args: ['-c', `echo pwned > ${JSON.stringify(target)}; echo done`],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stdout = drain(handle.stdout)
      const stderr = drain(handle.stderr)
      await handle.completion
      await Promise.all([stdout, stderr])
      expect(fs.existsSync(target)).toBe(false)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('still allows a shell write INSIDE the worktree', async () => {
    if (!containmentUsable()) return
    const { root, runtime, parent } = workspace()
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        args: ['-c', 'echo inside > allowed.txt'],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stderr = drain(handle.stderr)
      await handle.completion
      await stderr
      expect(fs.readFileSync(path.join(root, 'allowed.txt'), 'utf8').trim()).toBe(
        'inside',
      )
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it("cannot read the user's home directory", async () => {
    if (!containmentUsable()) return
    const { root, runtime, parent } = workspace()
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        args: ['-c', `ls ${JSON.stringify(os.homedir())} 2>&1 | head -3`],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stdout = drain(handle.stdout)
      await handle.completion
      // Not "the command failed" — the point is that the NAMES are not
      // enumerable, which is the grant `traversableAncestors` deliberately
      // narrows from `file-read*` to `file-read-metadata`.
      expect((await stdout).trim()).not.toContain('Documents')
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('containment availability', () => {
  it('refuses rather than downgrading where there is no mechanism', () => {
    expect(sponsoredLocalContainment('win32')).toEqual({
      available: false,
      reason: 'windows-no-containment',
    })
    expect(sponsoredLocalContainment('freebsd')).toEqual({
      available: false,
      reason: 'unsupported-platform',
    })
    expect(sponsoredLocalContainment('linux', { bwrapAvailable: false })).toEqual(
      { available: false, reason: 'bubblewrap-missing' },
    )
    expect(sponsoredLocalContainment('linux', { bwrapAvailable: true })).toEqual({
      available: true,
      mechanism: 'bubblewrap',
    })
    expect(sponsoredLocalContainment('darwin')).toEqual({
      available: true,
      mechanism: 'sandbox-exec',
    })
  })

  it('never starts a command on a platform it cannot contain', () => {
    const { root, runtime, parent } = workspace()
    try {
      expect(() =>
        createSponsoredTerminalBroker({
          workspaceRoot: root,
          runtimeDir: runtime,
          platform: 'win32',
        }).start({
          executable: 'bash',
          args: ['-c', 'echo hi'],
          cwd: root,
          env: {},
        }),
      ).toThrow(/cannot be contained on win32/)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

// ----------------------------------------------------------- device nodes

/**
 * A REAL git commit, through the REAL broker, on this machine.
 *
 * This is here because every fake passed. The macOS profile listed `/dev` as
 * readable and granted `file-write*` only to the worktree and the runtime
 * directory, so `/dev/null` was read-only -- and every git binary opens it for
 * reading AND writing at startup. `git --version` died with
 *
 *   fatal: could not open '/dev/null' for reading and writing: Operation not permitted
 *
 * which put `committed`, `landed` and the pull request out of reach on every
 * Mac. Nothing above caught it: the write acceptance test is a shell redirect
 * into the worktree, which needs no device node, and the profile assertions
 * are string matches on a profile that was wrong.
 *
 * So the assertion is the PRODUCT OUTCOME, not the profile text: a sponsored
 * run's whole purpose is to leave a commit for the user to review, and the
 * only honest test of that is to make one. A profile-string test would have
 * been just as green with `/dev/null` unwritable.
 */
describe('sponsored git (the commit the whole feature exists to produce)', () => {
  it('runs git init, add, commit and log through the broker', async () => {
    if (!containmentUsable()) return
    const { root, runtime, parent } = workspace()
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        args: [
          '-c',
          [
            'set -e',
            'git init -q .',
            // The run's HOME is empty by design, so there is no ambient
            // identity to commit under -- exactly as a real sponsored run
            // finds it.
            'git config user.email sponsored@example.invalid',
            'git config user.name "Sponsored Run"',
            'echo sponsored-change > CHANGED.md',
            'git add CHANGED.md',
            'git commit -q -m "sponsored change" --no-verify',
            'git log --oneline -1 --format=%s',
          ].join('\n'),
        ],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stdout = drain(handle.stdout)
      const stderr = drain(handle.stderr)
      const exitCode = await handle.completion
      const [out, err] = await Promise.all([stdout, stderr])
      // The failure text is asserted by name: if this regresses, the next
      // reader should see the device node in the test output rather than a
      // bare non-zero exit.
      expect(err).not.toContain('/dev/null')
      expect(err).not.toContain('Operation not permitted')
      expect(exitCode).toBe(0)
      expect(out.trim()).toContain('sponsored change')
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('writes /dev/null and the /dev/fd stdio aliases, and nothing else in /dev', async () => {
    if (!containmentUsable()) return
    const { root, runtime, parent } = workspace()
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        args: [
          '-c',
          [
            'echo x > /dev/null && echo null=ok || echo null=DENIED',
            'echo x > /dev/stderr 2>/dev/null && echo stderr=ok || echo stderr=DENIED',
            // Granted for nobody. `/dev/zero` stands in for the rest of the
            // directory -- bpf, the raw disks, auditpipe -- which is why this
            // is a literal list and not `(subpath "/dev")`.
            'echo x > /dev/zero 2>/dev/null && echo zero=ALLOWED || echo zero=denied',
          ].join('\n'),
        ],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stdout = drain(handle.stdout)
      const stderr = drain(handle.stderr)
      await handle.completion
      await stderr
      const out = await stdout
      expect(out).toContain('null=ok')
      // `/dev/stderr` is a symlink to `/dev/fd/2`, and seatbelt matches the
      // path the KERNEL resolves -- so this passes because `/dev/fd` is
      // granted, and would still fail if only `/dev/stderr` were.
      expect(out).toContain('stderr=ok')
      expect(out).toContain('zero=denied')
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('grants /dev/fd without letting a descriptor reach outside the worktree', async () => {
    if (!containmentUsable()) return
    const { root, runtime, parent } = workspace()
    const victim = path.join(parent, 'victim.txt')
    fs.writeFileSync(victim, 'ORIGINAL\n')
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        // Re-opening an inherited read-only descriptor for writing is the one
        // way `/dev/fd` could be an escape. It is not: seatbelt evaluates the
        // UNDERLYING file, so this is refused by the same worktree bound as a
        // plain redirect.
        args: ['-c', `exec 3< ${JSON.stringify(victim)}; echo PWNED > /dev/fd/3; echo done`],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stdout = drain(handle.stdout)
      const stderr = drain(handle.stderr)
      await handle.completion
      await Promise.all([stdout, stderr])
      expect(fs.readFileSync(victim, 'utf8')).toBe('ORIGINAL\n')
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

// ------------------------------------------------------------- F1 read clamp

describe('sponsored read containment (F1)', () => {
  it('refuses an absolute path, a traversal and a symlink escape', () => {
    const { root, parent } = workspace()
    const outside = path.join(parent, 'outside')
    fs.mkdirSync(outside, { recursive: true })
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'private')
    fs.symlinkSync(outside, path.join(root, 'escape'))
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src', 'ok.ts'), 'ok')
    try {
      expect(assertSponsoredReadPath(root, 'src/ok.ts')).toContain('ok.ts')
      expect(() =>
        assertSponsoredReadPath(root, path.join(outside, 'secret.txt')),
      ).toThrow(/inside its own worktree/)
      expect(() =>
        assertSponsoredReadPath(root, '../outside/secret.txt'),
      ).toThrow(/inside its own worktree/)
      expect(() => assertSponsoredReadPath(root, 'escape/secret.txt')).toThrow(
        /symlink/,
      )
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('refuses a leading ~ instead of resolving it inside the worktree', () => {
    // `path.resolve` has never heard of a tilde, so `~/.ssh/id_rsa` used to
    // come back as `<worktree>/~/.ssh/id_rsa` and PASS -- an ALLOW at the one
    // spelling every reader of this function expects refused. It stayed
    // inside the worktree, so it was harmless in fact and unreadable as
    // intent, which is the wrong pair of properties for the check three
    // surfaces share. Expanding it would be worse: the floor's whole point is
    // that HOME is somewhere else.
    const { root, parent } = workspace()
    try {
      for (const spelling of ['~', '~/.ssh/id_rsa', '~root/.ssh/id_rsa', '~/']) {
        expect(() => assertSponsoredReadPath(root, spelling)).toThrow(/worktree/)
        expect(() => assertSponsoredWritePath(root, spelling)).toThrow(/worktree/)
        expect(() => assertSponsoredCommandCwd(root, spelling)).toThrow(/worktree/)
      }
      // A tilde that no shell expands is an ordinary filename: Word's lock
      // file is a real thing to find beside a tracked document.
      fs.writeFileSync(path.join(root, '~$report.docx'), 'x')
      expect(assertSponsoredReadPath(root, '~$report.docx')).toContain(
        '~$report.docx',
      )
      // And a tilde anywhere but the front was never a shell expansion.
      expect(() => assertSponsoredWritePath(root, 'src/backup~')).not.toThrow()
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('answers a cwd the same way it answers a write (F9)', () => {
    // The cwd check used to be purely lexical while its write sibling
    // realpathed, so `cd linked-dir` out of the worktree was refused as a
    // write target and accepted as a working directory.
    const { root, parent } = workspace()
    const outside = path.join(parent, 'outside')
    fs.mkdirSync(outside, { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'escape'))
    try {
      expect(() => assertSponsoredCommandCwd(root, 'escape')).toThrow(/symlink/)
      expect(() => assertSponsoredWritePath(root, 'escape/x')).toThrow(/symlink/)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------- F2 loopback deny

describe('sponsored loopback containment (F2)', () => {
  it('denies loopback in the macOS profile while keeping egress', () => {
    const profile = sponsoredMacProfile(['/tmp/ws'], [])
    expect(profile).toContain('(allow network*)')
    // AFTER the allow: seatbelt takes the last matching rule, so the order is
    // the rule.
    expect(profile.indexOf('(deny network-outbound')).toBeGreaterThan(
      profile.indexOf('(allow network*)'),
    )
    expect(profile).toContain('(deny network-outbound (remote ip "localhost:*"))')
  })

  it('cannot reach a listener on this machine', async () => {
    if (!containmentUsable()) return
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('ORCHESTRATOR-REACHED'),
    })
    const { root, runtime, parent } = workspace()
    try {
      const handle = createSponsoredTerminalBroker({
        workspaceRoot: root,
        runtimeDir: runtime,
      }).start({
        executable: 'bash',
        args: [
          '-c',
          `curl -s --max-time 4 http://127.0.0.1:${server.port}/ || echo BLOCKED`,
        ],
        cwd: root,
        env: POLLUTED_ENV as NodeJS.ProcessEnv,
      })
      const stdout = drain(handle.stdout)
      const stderr = drain(handle.stderr)
      await handle.completion
      await stderr
      // The orchestrator's API pushes branches and opens pull requests with
      // the user's real credentials. A sandbox that can reach its own
      // supervisor contains nothing.
      expect(await stdout).not.toContain('ORCHESTRATOR-REACHED')
    } finally {
      server.stop(true)
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

// ------------------------------------------------- the layout Desktop creates

/**
 * A REAL project repository with a REAL linked worktree under it, exactly as
 * `freebuff-desktop/src/server/git/worktree.ts` lays one out.
 *
 * THIS IS THE POINT OF THE WHOLE SECTION. The git test above builds a
 * standalone repository with `git init` inside the sandbox root, so its `.git`
 * is a directory inside the write allowlist — a layout Desktop never produces.
 * Desktop runs every isolated thread in a LINKED worktree at
 * `<project>/.freebuff/worktrees/<threadId>`, whose `.git` is a GITFILE
 * pointing at `<project>/.git/worktrees/<threadId>`, which is outside the
 * sandbox root entirely. With the write roots at `[workspaceRoot, runtimeDir]`
 * every git command in that layout died at repository discovery:
 *
 *   fatal: not a git repository: (null)
 *
 * exit 128, on `status`, `add` and `commit` alike. So the standalone test was
 * green while the product could not commit at all, and the two look identical
 * from the outside. Building the real layout is the only thing that tells them
 * apart.
 *
 * The refs are PACKED deliberately (`git pack-refs --all`), which is both the
 * realistic state of any repository with history and the harder case: a ref
 * transaction takes `packed-refs.lock` even when it goes on to write a loose
 * ref, and without that one grant `git commit` fails outright. A test on a
 * freshly-initialised repository passes either way and proves nothing.
 */
function desktopLayout(): {
  project: string
  worktree: string
  runtime: string
  parent: string
  branch: string
  linkedWorktree: {
    commonDir: string
    gitDir: string
    branchNamespace: string
  }
} {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sponsored-desktop-'))
  const project = path.join(parent, 'project')
  fs.mkdirSync(project, { recursive: true })
  const git = (args: string[], cwd = project) =>
    spawnSync('git', args, { cwd, encoding: 'utf8' })
  git(['init', '-q', '-b', 'main', '.'])
  git(['config', 'user.email', 'user@example.invalid'])
  git(['config', 'user.name', 'The User'])
  // A credential in the user's own config, so the read surface is visible to
  // anybody reading this test rather than only described in a docblock.
  git(['config', 'remote.origin.url', 'https://u:SECRET-TOKEN@github.invalid/u/r.git'])
  fs.writeFileSync(path.join(project, 'README.md'), 'hello\n')
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'base'])
  git(['pack-refs', '--all'])

  const threadId = 'thread-abc'
  const branch = `freebuff/sponsored-advertiser-${threadId}`
  const worktree = path.join(project, '.freebuff', 'worktrees', threadId)
  git(['worktree', 'add', '-q', '-b', branch, worktree, 'main'])
  const runtime = path.join(project, '.freebuff', 'sponsored-runtime', threadId)
  fs.mkdirSync(runtime, { recursive: true })

  const resolve = (target: string) => {
    try {
      return fs.realpathSync(target)
    } catch {
      return target
    }
  }
  const ask = (flag: string) =>
    resolve(
      spawnSync(
        'git',
        ['-C', worktree, 'rev-parse', '--path-format=absolute', flag],
        { encoding: 'utf8' },
      ).stdout.trim(),
    )
  return {
    project,
    worktree: resolve(worktree),
    runtime: resolve(runtime),
    parent,
    branch,
    linkedWorktree: {
      commonDir: ask('--git-common-dir'),
      gitDir: ask('--git-dir'),
      branchNamespace: 'freebuff',
    },
  }
}

async function runInSandbox(
  options: Parameters<typeof createSponsoredTerminalBroker>[0],
  cwd: string,
  script: string,
): Promise<{ exitCode: number | null; out: string; err: string }> {
  const handle = createSponsoredTerminalBroker(options).start({
    executable: 'bash',
    args: ['-c', script],
    cwd,
    env: POLLUTED_ENV as NodeJS.ProcessEnv,
  })
  const stdout = drain(handle.stdout)
  const stderr = drain(handle.stderr)
  const exitCode = await handle.completion
  const [out, err] = await Promise.all([stdout, stderr])
  return { exitCode, out, err }
}

const COMMIT_SCRIPT = [
  'set -e',
  'echo sponsored-change > CHANGED.md',
  'git status --porcelain',
  'git add CHANGED.md',
  'git -c user.email=sponsored@example.invalid -c user.name="Sponsored Run" commit -q -m "sponsored change" --no-verify',
  'git log --oneline -1 --format=%s',
].join('\n')

describe('sponsored git in the layout Desktop actually creates', () => {
  it('commits in a linked worktree, and the commit lands in the user\'s repository', async () => {
    if (!containmentUsable()) return
    const layout = desktopLayout()
    try {
      const { exitCode, out, err } = await runInSandbox(
        {
          workspaceRoot: layout.worktree,
          runtimeDir: layout.runtime,
          linkedWorktree: layout.linkedWorktree,
        },
        layout.worktree,
        COMMIT_SCRIPT,
      )
      // Named, so a regression prints the reason rather than a bare exit code.
      expect(err).not.toContain('not a git repository')
      expect(err).not.toContain('packed-refs.lock')
      expect(err).not.toContain('Operation not permitted')
      expect(exitCode).toBe(0)
      expect(out).toContain('sponsored change')

      // THE PRODUCT OUTCOME, asked of the USER'S repository rather than of the
      // sandbox: the branch has to be visible from the checkout the user will
      // open the pull request from, or `committed` and `landed` are unreachable
      // however well the commit went inside the worktree.
      const tip = spawnSync(
        'git',
        ['-C', layout.project, 'log', '--oneline', '-1', layout.branch],
        { encoding: 'utf8' },
      )
      expect(tip.status).toBe(0)
      expect(tip.stdout).toContain('sponsored change')

      // And it did not damage the repository on the way.
      expect(
        spawnSync('git', ['-C', layout.project, 'rev-parse', 'main'], {
          encoding: 'utf8',
        }).status,
      ).toBe(0)
      expect(
        spawnSync('git', ['-C', layout.project, 'fsck'], { encoding: 'utf8' })
          .stderr,
      ).not.toContain('error')
    } finally {
      fs.rmSync(layout.parent, { recursive: true, force: true })
    }
  })

  /**
   * The blocker itself, pinned.
   *
   * Without the grant the run cannot even ask what repository it is in. This is
   * here so that the option above can never be quietly dropped as unnecessary:
   * if this test starts passing, the sandbox has stopped bounding the common
   * dir and the one below is no longer proving anything.
   */
  it('cannot reach the repository at all without the grant', async () => {
    if (!containmentUsable()) return
    const layout = desktopLayout()
    try {
      const { out, err } = await runInSandbox(
        { workspaceRoot: layout.worktree, runtimeDir: layout.runtime },
        layout.worktree,
        'git status --porcelain; echo "exit=$?"',
      )
      expect(err).toContain('not a git repository')
      expect(out).toContain('exit=128')
    } finally {
      fs.rmSync(layout.parent, { recursive: true, force: true })
    }
  })

  /**
   * The grant is an ALLOWLIST, and this is the half that matters.
   *
   * `.git/hooks/*` is arbitrary code execution as the user on their next git
   * operation, in a directory that never appears in the pull request they
   * review. `.git/config` is the same thing through `core.pager`,
   * `diff.external`, `core.fsmonitor` and aliases — and worse, because the
   * ORCHESTRATOR runs `git -C <worktree>` unsandboxed, as the user, to build
   * the changes panel. Granting write to the common dir to make the commit work
   * would have been a bigger hole than the one it closed.
   */
  it('refuses every dangerous path under the user\'s real .git', async () => {
    if (!containmentUsable()) return
    const layout = desktopLayout()
    const common = layout.linkedWorktree.commonDir
    try {
      const probes: [string, string][] = [
        ['hooks', `${common}/hooks/post-checkout`],
        ['config', `${common}/config`],
        ['config-worktree', `${common}/config.worktree`],
        ['info', `${common}/info/exclude`],
        ['packed-refs', `${common}/packed-refs`],
        ['common-root', `${common}/a-new-file`],
        // Another branch's tip: the grant is scoped to `refs/heads/freebuff`,
        // so the user's own branches are out of reach. Granting `refs/`
        // wholesale would let a run rewrite or delete every branch they have.
        ['other-branch', `${common}/refs/heads/main`],
        ['other-branch-log', `${common}/logs/refs/heads/main`],
      ]
      const script = probes
        .map(
          ([name, target]) =>
            `echo pwned > ${JSON.stringify(target)} 2>/dev/null && echo "${name}=ALLOWED" || echo "${name}=denied"`,
        )
        .join('\n')
      const { out } = await runInSandbox(
        {
          workspaceRoot: layout.worktree,
          runtimeDir: layout.runtime,
          linkedWorktree: layout.linkedWorktree,
        },
        layout.worktree,
        script,
      )
      for (const [name] of probes) expect(out).toContain(`${name}=denied`)
      expect(out).not.toContain('ALLOWED')

      // And the user's repository is genuinely untouched by the attempt.
      expect(
        fs.readFileSync(path.join(common, 'config'), 'utf8'),
      ).not.toContain('pwned')
      expect(fs.existsSync(path.join(common, 'hooks', 'post-checkout'))).toBe(
        false,
      )
    } finally {
      fs.rmSync(layout.parent, { recursive: true, force: true })
    }
  })

  /**
   * `packed-refs.lock` is granted; `packed-refs` is not.
   *
   * Split deliberately, and the split is the whole reason the lock is a
   * `literal` rather than the directory being writable: git must be able to
   * CREATE the lock for a ref transaction to run at all, and rewriting the
   * packed ref table is where deleting somebody else's branch would happen.
   */
  it('lets git take the packed-refs lock without letting it rewrite packed-refs', async () => {
    if (!containmentUsable()) return
    const layout = desktopLayout()
    const common = layout.linkedWorktree.commonDir
    try {
      const { out } = await runInSandbox(
        {
          workspaceRoot: layout.worktree,
          runtimeDir: layout.runtime,
          linkedWorktree: layout.linkedWorktree,
        },
        layout.worktree,
        [
          `echo x > ${JSON.stringify(`${common}/packed-refs.lock`)} 2>/dev/null && echo lock=writable || echo lock=DENIED`,
          `rm -f ${JSON.stringify(`${common}/packed-refs.lock`)}`,
          `echo x > ${JSON.stringify(`${common}/packed-refs`)} 2>/dev/null && echo table=WRITABLE || echo table=denied`,
        ].join('\n'),
      )
      expect(out).toContain('lock=writable')
      expect(out).toContain('table=denied')
    } finally {
      fs.rmSync(layout.parent, { recursive: true, force: true })
    }
  })
})
