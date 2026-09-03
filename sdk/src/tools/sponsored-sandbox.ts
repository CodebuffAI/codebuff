/**
 * OS containment for a sponsored run executing on the user's own machine.
 *
 * COD-336's mechanism. Promoted here out of `evals/sponsored/sandbox.ts`,
 * which is where it was first written and proven, because it is now a
 * production boundary rather than an eval harness: Desktop (COD-397) and the
 * CLI (COD-339) both run advertiser-authored procedures locally, and both need
 * exactly this. The eval keeps its own env scrub and its own sandboxed write
 * worker and delegates the containment below, so there is ONE seatbelt profile
 * and ONE bubblewrap argument list in the repository.
 *
 * ## Why it lives behind `TerminalCommandBroker`
 *
 * `sandbox-exec` has printed a deprecation warning for years and Apple ships
 * no replacement for third-party process confinement. The day it is removed,
 * the macOS arm of this is gone. Sitting behind the SDK's existing broker seam
 * (`run-terminal-command.ts`) makes that a SWAP rather than a rewrite — the
 * caller passes a broker, and what the broker does inside is this file's
 * problem alone.
 *
 * ## What it does and does not stop
 *
 * Stops: reading `~/.ssh`, `~/.aws`, `~/.npmrc` and every other dotfile
 * (`HOME` is redirected AND the filesystem denies the real one); writing
 * anywhere but the worktree and the run's private runtime directory, including
 * through a symlink; git finding an ambient credential or prompting for one.
 *
 * Also stops: reaching the machine the run is on. Both profiles deny loopback,
 * because the orchestrator's own API listens there.
 *
 * What it does NOT stop is written down in
 * `docs/freebuff-sponsored-local-execution.md` §9, which is private. This file
 * ships to the public repository, and an inventory of a boundary's gaps is
 * worth more to somebody probing it than to anybody maintaining it.
 *
 * ## Refuse, never downgrade
 *
 * An unsupported platform throws and a missing `bwrap` throws. Neither falls
 * back to an uncontained spawn: a boundary that silently is not there is worse
 * than one that is honestly absent, because nothing anywhere says which you
 * got. The surface asks {@link sponsoredContainment} FIRST and never offers
 * the run at all where the answer is no.
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import {
  scrubSponsoredLocalEnv,
  sponsoredLocalContainment,
  type SponsoredLocalContainment,
} from '@codebuff/common/ads/sponsored-local-execution'

import type {
  TerminalCommandBroker,
  TerminalCommandProcess,
  TerminalCommandSpawnRequest,
} from './run-terminal-command'

/** Where `bwrap` is on the distributions we have seen it on. */
const BWRAP_PATHS = ['/usr/bin/bwrap', '/bin/bwrap', '/usr/local/bin/bwrap']

export function findBubblewrap(): string | null {
  return BWRAP_PATHS.find((candidate) => fs.existsSync(candidate)) ?? null
}

/**
 * Whether this machine can contain a sponsored run, and with what.
 *
 * The disk probe is HERE and the decision is in `common`, so the rule is
 * stated once and shared with the surfaces that render a refusal.
 */
export function sponsoredContainment(
  platform: NodeJS.Platform = process.platform,
): SponsoredLocalContainment {
  return sponsoredLocalContainment(platform, {
    bwrapAvailable: platform === 'linux' ? findBubblewrap() !== null : false,
  })
}

export interface SponsoredSandboxOptions {
  /** The worktree. The only tracked tree this run may write. */
  workspaceRoot: string
  /**
   * The run's private `HOME`/`TMPDIR`, writable and OUTSIDE the worktree.
   *
   * Outside deliberately: anything the run's tooling drops in `HOME` — a
   * `.gitconfig`, a package-manager cache, a lockfile from something that
   * ignored the install refusal — must not show up in the diff the user is
   * asked to review, and must not be one `git add -A` away from the branch.
   * The eval passes a path inside its throwaway checkout, which is fine there
   * because the whole checkout is thrown away.
   */
  runtimeDir: string
  /** Extra trees the run may READ (a toolchain, a shared cache). Never write. */
  additionalReadRoots?: string[]
  /** Injected by the eval, which keeps its own (wider) allowlist. */
  scrubEnv?: (
    source: Record<string, string | undefined>,
    paths: { home: string; tmp: string },
  ) => Record<string, string>
  platform?: NodeJS.Platform
}

/**
 * The one containment every sponsored path check is built from.
 *
 * Two questions, in this order, because they fail differently and the run has
 * to be told which one it hit:
 *
 *  1. LEXICAL — does `requested`, resolved against the worktree, still name
 *     something under it? An absolute path or a `..` fails here.
 *  2. PHYSICAL — does the nearest EXISTING ancestor of that path still
 *     realpath under the worktree? A symlink inside the repository pointing
 *     out of it passes (1) and fails here, and the ancestor walk is the only
 *     way to answer this for a path that does not exist yet.
 *
 * Returns the resolved absolute path, so a caller acts on the same string the
 * check passed rather than re-resolving and possibly resolving something else.
 * Throws a NAMED refusal: callers turn it into a tool result the run reads,
 * and a silent empty answer would teach an advertiser's procedure that a file
 * was missing rather than that the boundary said no.
 */
/**
 * A first segment a shell would tilde-expand: `~`, `~/x`, `~someone/x`.
 *
 * `$` after the tilde is excluded deliberately — `~$report.docx` is Word's
 * lock file, a real tracked-adjacent name, and no shell expands it.
 */
const TILDE_PATH = /^~[^$]*(?:[/\\]|$)/

export function containSponsoredPath(
  workspaceRoot: string,
  requested: string,
  verb: 'read files' | 'write' | 'run commands',
): string {
  // Realpath the ROOT: a worktree under `/var/folders/...` is really
  // `/private/var/folders/...` on macOS, and comparing a real path against a
  // symlinked root would refuse every path in the worktree.
  // A LEADING `~` IS REFUSED, NOT RESOLVED, and not quietly accepted either.
  // `path.resolve` has no idea what a tilde is, so `~/.ssh/id_rsa` used to
  // come back as `<worktree>/~/.ssh/id_rsa` and PASS both checks below — an
  // allow, at the exact spelling every reader of this function expects to see
  // refused. It was harmless in fact (the path stays inside the worktree, and
  // a symlink out of it is still realpathed) and unreadable as intent, which
  // is the wrong pair of properties for a boundary. Expanding it instead
  // would be worse: the whole point of the floor is that `HOME` is somewhere
  // else, so the only honest answer to "the user's home directory" here is
  // no. Refused for reads, writes and cwd alike — F9's rule that the three
  // must not answer the same path differently.
  if (TILDE_PATH.test(requested)) {
    throw new Error(
      `A sponsored run may only ${verb} inside its own worktree, and \`~\` is not a path inside it.`,
    )
  }
  const root = realpathOrSelf(path.resolve(workspaceRoot))
  const requestedAbs = path.resolve(root, requested)

  // Split into the deepest EXISTING ancestor plus the tail that does not
  // exist yet, realpath the ancestor, and put the tail back. Only the
  // existing part can carry a symlink, and the tail is what makes this
  // answerable for a file that has not been created.
  //
  // The walk STOPS AT THE ROOT. Above it there is nothing left to learn — the
  // root has already been realpathed — and on macOS an ancestor above it
  // always resolves elsewhere, because `/tmp` is a symlink to `/private/tmp`.
  // Walking past the root refused every path under a worktree that did not
  // exist yet.
  const tail: string[] = []
  let existing = requestedAbs
  while (existing !== root && !fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) break
    tail.unshift(path.basename(existing))
    existing = parent
  }
  const resolved = path.join(
    existing === root ? root : realpathOrSelf(existing),
    ...tail,
  )

  if (escapesRoot(root, resolved)) {
    // WHICH escape it was decides the sentence the run reads, and the two are
    // different problems: a path it can rewrite, or a link it cannot see.
    throw new Error(
      escapesRoot(root, requestedAbs)
        ? `A sponsored run may only ${verb} inside its own worktree.`
        : `A sponsored run may not ${verb} through a symlink that leaves its worktree.`,
    )
  }
  return resolved
}

function escapesRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative.startsWith('..') || path.isAbsolute(relative)
}

function realpathOrSelf(target: string): string {
  try {
    return fs.realpathSync(target)
  } catch {
    return target
  }
}

/**
 * Refuse a working directory outside the worktree.
 *
 * This bounds where a command STARTS, not where it goes — an absolute path in
 * the command itself walks straight past it. That is what the OS sandbox is
 * for; this is the cheap check that catches the sloppy case and is the only
 * thing available on a platform with no sandbox.
 *
 * It resolves symlinks, like its write and read siblings. It used to be purely
 * lexical while they were not, so `cd linked-dir` out of the worktree was
 * refused as a WRITE target and accepted as a working directory — one boundary
 * with two answers, and no reason for the difference.
 */
export function assertSponsoredCommandCwd(
  workspaceRoot: string,
  requestedCwd: string,
): void {
  containSponsoredPath(workspaceRoot, requestedCwd, 'run commands')
}

/**
 * Refuse a write outside the worktree, INCLUDING through a symlink.
 *
 * Lexical containment is not enough when a repository contains a symlink
 * pointing outside itself: `linked-dir/new-file` resolves inside the worktree
 * as a string and lands outside it on disk.
 */
export function assertSponsoredWritePath(
  workspaceRoot: string,
  requestedPath: string,
): void {
  containSponsoredPath(workspaceRoot, requestedPath, 'write')
}

/**
 * Refuse a READ outside the worktree, by the same rule as a write.
 *
 * Why this exists at all is the whole of finding F1: the broker below covers
 * exactly ONE tool. `read_files`, `code_search` and `list_directory` execute
 * in the orchestrator's own process, as the user, and each resolves an
 * absolute path deliberately — so a procedure containing no shell command at
 * all could read the user's private keys and hand them to the granted
 * `read_url`. The clamp is applied by the surface, per tool, before the tool
 * runs; this is the shared rule it applies.
 */
export function assertSponsoredReadPath(
  workspaceRoot: string,
  requestedPath: string,
): string {
  return containSponsoredPath(workspaceRoot, requestedPath, 'read files')
}

const KILL_ESCALATION_MS = 2_000

function groupAlive(child: ReturnType<typeof spawn>): boolean {
  if (!child.pid) return false
  try {
    process.kill(-child.pid, 0)
    return true
  } catch {
    return false
  }
}

function killGroup(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals | number,
): void {
  if (!child.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal as NodeJS.Signals)
    } catch {
      // already gone
    }
  }
}

async function waitForGroupExit(
  child: ReturnType<typeof spawn>,
  budgetMs: number,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    if (!groupAlive(child)) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return !groupAlive(child)
}

/**
 * The handle, with the process GROUP reaped when the command reports done.
 *
 * A synchronous command does not transfer ownership of what it backgrounded:
 * `some-server &` returns immediately, the turn ends, and the descendant keeps
 * running — with whatever network the profile gave it — for as long as the
 * user leaves the app open. `run-terminal-command.ts` reaps its own group for
 * exactly this reason and this broker did not, so a sponsored run was the ONE
 * shell on the machine that could outlive its turn.
 *
 * The reap is attached to `completion` rather than to `kill`, because the case
 * that matters is the command SUCCEEDING and leaving something behind.
 */
function processHandle(child: ReturnType<typeof spawn>): TerminalCommandProcess {
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code))
  })
  const completion = closed.then(async (exitCode) => {
    if (process.platform === 'win32' || !groupAlive(child)) return exitCode
    killGroup(child, 'SIGTERM')
    if (await waitForGroupExit(child, KILL_ESCALATION_MS)) return exitCode
    killGroup(child, 'SIGKILL')
    await waitForGroupExit(child, KILL_ESCALATION_MS)
    return exitCode
  })
  return {
    pid: child.pid,
    stdout: child.stdout!,
    stderr: child.stderr!,
    completion,
    kill: (signal) => killGroup(child, signal),
    isAlive: () => groupAlive(child),
  }
}

/**
 * Seatbelt matches the path the KERNEL resolves, so a `subpath` naming a
 * symlinked root never matches: a checkout under `/var/folders/...` is really
 * `/private/var/folders/...`. Roots that do not exist yet are left alone
 * rather than dropped.
 */
function canonicalRoot(target: string): string {
  try {
    return fs.realpathSync(target)
  } catch {
    return target
  }
}

/**
 * Every directory on the way to a granted root must be traversable, or the
 * process cannot follow the symlinks between them — and on macOS 26 a
 * `(deny default)` process whose profile omits `/` aborts with SIGABRT before
 * it runs at all.
 *
 * `file-read*` on a directory INCLUDES `readdir`, so granting it to each
 * ancestor as a `literal` would let a sponsored run enumerate the names in
 * every directory between `/` and the workspace — `/Users/<name>` and every
 * sibling temp directory included. Verified by running `ls` under such a
 * profile, not by reading the manual. Ancestors therefore get
 * `file-read-metadata`, which is enough to `stat` and traverse and not enough
 * to list; only `/` keeps `file-read*`, because that is what the macOS 26
 * abort actually requires.
 */
function traversableAncestors(targets: string[]): string[] {
  const ancestors = new Set(['/'])
  for (const target of targets) {
    let current = path.dirname(target)
    while (current !== path.dirname(current)) {
      ancestors.add(current)
      current = path.dirname(current)
    }
  }
  return [...ancestors]
}

/**
 * The device nodes a normal toolchain must be able to WRITE, and nothing more.
 *
 * `/dev` is in the readable set, and readable is not enough: every git binary
 * opens `/dev/null` for reading AND writing at startup, so with `file-write*`
 * granted only to the worktree and the runtime directory, `git --version`
 * itself dies with
 *
 *   fatal: could not open '/dev/null' for reading and writing: Operation not permitted
 *
 * That is machine-independent — reproduced on Homebrew git 2.55.0, so it is
 * not the `/var/select/developer_dir` Xcode-shim failure §9 already describes
 * — and it put `committed`, `landed` and the pull request out of reach on
 * every Mac. Nothing caught it, because a shell redirect into the worktree,
 * which is what the acceptance tests run, needs no device node.
 *
 * NOT `(subpath "/dev")`. `/dev` holds `bpf*` (packet capture), `disk*` (the
 * raw block devices) and `auditpipe`; unix permissions are what keep those out
 * of reach, and a blanket write grant would leave nothing else in the way the
 * day one of them is group-writable. Each entry below was MEASURED to be
 * needed, and the candidates that were measured and are NOT needed are listed
 * with their reasons so the next person does not re-derive them.
 *
 * Measured on macOS 26.5 (Darwin 25.5) by ablation: grant the candidate set,
 * run a real `git init` / `add` / `commit` / `log` through the shipped broker,
 * then drop one node at a time and see what breaks.
 *
 *  - `/dev/null` — REQUIRED. Dropping it is the blocker above.
 *  - `/dev/fd` — GRANTED as a subpath, and the only subpath here.
 *    `/dev/stdout` and `/dev/stderr` are SYMLINKS to `/dev/fd/1` and
 *    `/dev/fd/2`, and seatbelt matches the path the kernel resolves, so a
 *    `(literal "/dev/stdout")` grant is inert: measured, with `/dev/null`,
 *    `/dev/stdout` and `/dev/stderr` all granted as literals, `echo hi >
 *    /dev/stdout` is still `Operation not permitted`, and it succeeds the
 *    moment `/dev/fd` is granted instead. `> /dev/stderr` and `tee
 *    /dev/stderr` are ordinary shell-script spellings; a build that uses one
 *    should not die inside a sponsored run.
 *
 *    It does not widen the boundary. `/dev/fd/N` names the process's OWN
 *    descriptors, and re-opening one is evaluated by seatbelt against the
 *    UNDERLYING file — measured: with this grant in place, `exec 3<
 *    outside.txt; echo PWNED > /dev/fd/3` is refused with the error naming
 *    `outside.txt` rather than `/dev/fd/3`, and the file is unchanged. Same
 *    for `/etc/hosts`, which answers `Permission denied`.
 *  - `/dev/tty` — NOT granted. The broker spawns `detached` with pipes for
 *    stdio, so the run has no controlling terminal: measured, reading
 *    `/dev/tty` answers "Device not configured" whether or not the write is
 *    granted. The grant would be dead code.
 *  - `/dev/dtracehelper`, `/dev/random`, `/dev/urandom`, `/dev/zero` — NOT
 *    granted. Reading is what they are for and reading already works through
 *    the `/dev` read grant: measured, `node`'s crypto, `python3`'s
 *    `os.urandom` and `head -c 8 /dev/urandom` all work with no write grant,
 *    and the git flow passes with each of them dropped.
 *  - `/dev/stdin`, `/dev/ptmx`, `/dev/console` — NOT granted. Nothing in the
 *    ablation needed them, and `/dev/stdin` is a `/dev/fd/0` symlink already
 *    covered above.
 *
 * KNOWN, AND NOT A DEVICE PROBLEM: BSD `diff <(…)` still fails with
 * `/dev/fd/63: Operation not permitted`. Measured, that is fixed by neither
 * `(subpath "/dev")`, nor `file-ioctl`, nor granting the confstr temp
 * directory — only a blanket `(allow file*)` clears it — so it is a file
 * operation on the anonymous pipe with no path to name. `cat`, `grep`,
 * `source` and bash's `<<<` all work with process substitution. Left alone
 * rather than bought with a blanket grant.
 */
const SPONSORED_DEVICE_WRITE_LITERALS: readonly string[] = ['/dev/null']
const SPONSORED_DEVICE_WRITE_SUBPATHS: readonly string[] = ['/dev/fd']

/**
 * `readlink("/var")`, which is the whole of what the system resolver needs.
 *
 * Without it `getaddrinfo` answers `ENOTFOUND` for every name, so `curl
 * https://example.com` and `git ls-remote https://…` fail. Egress is accepted
 * by COD-336 decision item 8, and this made the granted capability work only
 * for a caller who already knew an address — a silent failure for an honest
 * procedure, and no boundary at all. It closes a hole in the STATED
 * capability rather than in the containment; the measurements behind that
 * claim are in `docs/freebuff-sponsored-local-execution.md` §9, which is
 * private, because an account of what a boundary does not stop is worth more
 * to somebody probing it than to anybody maintaining it.
 *
 * Bisected to this one literal on macOS 26.5: the resolver reads the `/var`
 * SYMLINK, and the profile's ancestor grants only ever cover `/private/var`
 * — measured, `(subpath "/private/var")` does not help and `(literal "/var")`
 * alone does. It grants exactly `readlink` on the link: with it in place, `ls
 * /var`, `ls /private/var` and `cat /var/run/resolv.conf` are all still
 * `Operation not permitted`, and the user's home directory stays unreadable.
 * Loopback stays denied, which is the denial that matters.
 */
const SPONSORED_RESOLVER_READ_LITERALS: readonly string[] = ['/var']

export function sponsoredMacProfile(
  writeRoots: string[],
  additionalReadRoots: string[],
): string {
  const q = JSON.stringify
  const writable = writeRoots.map(canonicalRoot)
  const extraRoots = additionalReadRoots.map(canonicalRoot)
  const readable = [
    '/System',
    '/usr',
    '/bin',
    '/sbin',
    '/Library',
    '/opt',
    '/etc',
    '/private/etc',
    '/private/var/db',
    '/dev',
    ...writable,
    ...extraRoots,
  ]
  // Both spellings of each root contribute ancestors: the child still reaches
  // its workspace through the symlinked path it was handed.
  const traversable = traversableAncestors([
    ...readable,
    ...writeRoots,
    ...additionalReadRoots,
  ])
  return [
    '(version 1)',
    '(deny default)',
    // NARROWER THAN `(allow process*)`, which is what this was. `process*`
    // also grants `process-info*`, and the run has no business inspecting
    // anything but itself.
    //
    // Measured on macOS 26.5, because seatbelt vocabulary is not something to
    // reason about from the manual:
    //
    //  - a blanket `(deny process-info*)` KILLS THE PROCESS at start. dyld
    //    needs process-info on self, so the deny must carry
    //    `(target others)` and the allow must carry `(target self)`.
    //  - the deny does NOT currently stop `proc_listpids`/`proc_pidpath`
    //    against another process — enumeration and executable paths are still
    //    readable with it in place. It is kept because it costs nothing, it
    //    is the correct declaration of intent, and the platform's answer here
    //    has changed before.
    //  - reading another process's ENVIRONMENT does not work on this OS at
    //    all, sandbox or not (`ps eww <other pid>` prints none). Nothing here
    //    should be read as relying on that: the orchestrator deletes its
    //    launch secret from `process.env` after reading it, which is the
    //    control that actually holds.
    '(allow process-exec)',
    '(allow process-fork)',
    '(allow process-info* (target self))',
    '(deny process-info* (target others))',
    '(allow signal (target self))',
    // KEPT, and needed: without it Bun aborts at startup with "memory
    // allocation of 48 bytes failed" — it reads `hw.memsize` to size its
    // heap. Measured by removing it, which broke `bun` while leaving `bash`,
    // `node` and `/bin/date` working.
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    // EGRESS IS ALLOWED, LOOPBACK IS NOT, and the second half is not a detail.
    // Egress off the machine is accepted by decision (COD-336 item 8) and was
    // never bounded on Cloud either. Egress to THIS machine is a different
    // thing entirely: the Desktop orchestrator listens on 127.0.0.1:8787 and
    // its API can push a branch, open a pull request with the user's own
    // credentials, and drive the user's own unsandboxed agent. A sandbox that
    // reaches its own supervisor over loopback contains nothing.
    //
    // The `deny` has to come AFTER the `allow`: seatbelt takes the LAST
    // matching rule, so the order here is the rule.
    '(allow network*)',
    '(deny network-outbound (remote ip "localhost:*"))',
    '(deny network-inbound (local ip "localhost:*"))',
    `(allow file-read* (literal "/") ${[
      ...SPONSORED_RESOLVER_READ_LITERALS.map((item) => `(literal ${q(item)})`),
      ...readable.map((item) => `(subpath ${q(item)})`),
    ].join(' ')})`,
    // Traverse, do not enumerate. See `traversableAncestors` above.
    `(allow file-read-metadata ${traversable
      .filter((item) => item !== '/')
      .map((item) => `(literal ${q(item)})`)
      .join(' ')})`,
    // The worktree and the run's private runtime directory, and after them the
    // handful of device nodes a toolchain cannot start without. See
    // SPONSORED_DEVICE_WRITE_LITERALS for why each one is on that list and why
    // the rest of `/dev` is not.
    `(allow file-write* ${[
      ...writable.map((item) => `(subpath ${q(item)})`),
      ...SPONSORED_DEVICE_WRITE_LITERALS.map((item) => `(literal ${q(item)})`),
      ...SPONSORED_DEVICE_WRITE_SUBPATHS.map((item) => `(subpath ${q(item)})`),
    ].join(' ')})`,
  ].join('\n')
}

function spawnMac(
  request: TerminalCommandSpawnRequest,
  writeRoots: string[],
  env: NodeJS.ProcessEnv,
  additionalReadRoots: string[],
): TerminalCommandProcess {
  return processHandle(
    spawn(
      '/usr/bin/sandbox-exec',
      [
        '-p',
        sponsoredMacProfile(writeRoots, additionalReadRoots),
        request.executable,
        ...request.args,
      ],
      {
        cwd: request.cwd,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
  )
}

function spawnLinux(
  request: TerminalCommandSpawnRequest,
  writeRoots: string[],
  env: NodeJS.ProcessEnv,
  additionalReadRoots: string[],
): TerminalCommandProcess {
  const bwrap = findBubblewrap()
  if (!bwrap) {
    // Refuse, never downgrade. See the file docblock.
    throw new Error(
      'bubblewrap (bwrap) is required to contain a sponsored run on Linux.',
    )
  }
  // NO `--share-net`. bubblewrap has no firewall — it can give the run the
  // host's network namespace or a fresh empty one, and nothing in between —
  // so "network minus loopback", which is what the macOS profile above
  // expresses, is not sayable here. Faced with that, the run gets its own
  // empty namespace:
  //
  //   - loopback egress is the one that MATTERS. `--share-net` puts the run
  //     on the same 127.0.0.1 as the orchestrator, whose API pushes branches
  //     and opens pull requests with the user's real credentials.
  //   - nothing granted actually needs the sandbox to reach the internet.
  //     `read_url` and `web_search` — the two tools carrying the `network`
  //     capability — execute in the orchestrator's process, not in here, and
  //     dependency installs are refused outright (COD-336 item 5).
  //
  // So this diverges from the macOS arm, which keeps external egress, and the
  // divergence is deliberate: on Linux the choice is between blocking
  // loopback and keeping a capability nothing uses.
  const args = ['--die-with-parent', '--unshare-all', '--new-session']
  for (const dir of ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc', '/opt']) {
    if (fs.existsSync(dir)) args.push('--ro-bind', dir, dir)
  }
  for (const dir of additionalReadRoots) {
    if (fs.existsSync(dir)) args.push('--ro-bind', dir, dir)
  }
  // `--dev /dev` mounts a FRESH devtmpfs the run owns, so the macOS device
  // problem does not exist on this arm: bubblewrap populates it with
  // null/zero/full/random/urandom/tty (writable, because the mount is the
  // run's own) plus the `/dev/fd -> /proc/self/fd` and stdin/stdout/stderr
  // symlinks, and it does NOT carry the host's `bpf*`, `disk*` or
  // `auditpipe`. The macOS profile has to enumerate literals precisely
  // because seatbelt filters the host's real `/dev` rather than replacing it.
  //
  // NOT VERIFIED ON A LINUX HOST — there is none on the machine this was
  // written on, and the SDK's containment tests self-skip without `bwrap`, so
  // CI's Linux runner does not close this either. It is read off bubblewrap's
  // documented `--dev` behaviour, and the git regression test in
  // `sdk/src/__tests__/sponsored-sandbox.test.ts` will exercise it the first
  // time it runs somewhere `bwrap` exists.
  args.push('--proc', '/proc', '--dev', '/dev')
  for (const dir of writeRoots) {
    if (fs.existsSync(dir)) args.push('--bind', dir, dir)
  }
  args.push('--chdir', request.cwd, '--clearenv')
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) args.push('--setenv', key, value)
  }
  args.push(request.executable, ...request.args)
  return processHandle(
    spawn(bwrap, args, {
      cwd: request.cwd,
      // `bwrap` itself only needs a PATH; `--clearenv` plus the `--setenv`
      // pairs above are what the CHILD sees. Cast because some consumers
      // declare a required-key ProcessEnv, and inheriting keys to satisfy a
      // type would defeat the point of the scrub.
      env: { PATH: env.PATH } as unknown as NodeJS.ProcessEnv,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
}

/**
 * The broker a sponsored local run passes to `runTerminalCommand`.
 *
 * Note what it does to the env it is handed: it DISCARDS it and builds its
 * own. `runTerminalCommand` merges `getSystemProcessEnv()` into every request
 * before it reaches a broker, so a caller that only passed a scrubbed `env`
 * would still hand the child the user's whole environment. Scrubbing here, at
 * the last point before the spawn, is what makes that impossible to get wrong
 * from the outside.
 */
export function createSponsoredTerminalBroker(
  options: SponsoredSandboxOptions,
): TerminalCommandBroker {
  const workspaceRoot = path.resolve(options.workspaceRoot)
  const runtimeDir = path.resolve(options.runtimeDir)
  const additionalReadRoots = (options.additionalReadRoots ?? []).map((item) =>
    path.resolve(item),
  )
  const platform = options.platform ?? process.platform
  const scrubEnv = options.scrubEnv ?? scrubSponsoredLocalEnv
  const home = path.join(runtimeDir, 'home')
  const tmp = path.join(runtimeDir, 'tmp')

  return {
    start(request) {
      assertSponsoredCommandCwd(workspaceRoot, request.cwd)
      fs.mkdirSync(home, { recursive: true })
      fs.mkdirSync(tmp, { recursive: true })
      const env = scrubEnv(request.env, { home, tmp }) as NodeJS.ProcessEnv
      const writeRoots = [workspaceRoot, runtimeDir]
      if (platform === 'darwin') {
        return spawnMac(request, writeRoots, env, additionalReadRoots)
      }
      if (platform === 'linux') {
        return spawnLinux(request, writeRoots, env, additionalReadRoots)
      }
      throw new Error(
        `A sponsored run cannot be contained on ${platform}, so it will not be started.`,
      )
    },
  }
}
