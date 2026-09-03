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
