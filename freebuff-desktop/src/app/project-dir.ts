/**
 * Project directory resolution for "open a folder" (§6.2). The desktop app points
 * the orchestrator at a real local git repo the user chooses at runtime, instead of
 * a fixed startup path. This module owns:
 *
 *  - validateProjectDir()  — is this path a usable project root? (exists, is a dir,
 *                            is a git repo) and what's its default branch.
 *  - last-opened persistence so reopening the app returns to the same project.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'

import { bunRunner } from '../core/exec'

export interface ProjectDirInfo {
  ok: boolean
  /** Absolute, resolved path. */
  path: string
  /** Default branch of the repo (e.g. `main`/`master`), when ok. */
  defaultBranch?: string
  /** Human-readable reason when `ok` is false. */
  error?: string
  /** True when the only problem is that the folder isn't a git repo yet —
   *  i.e. `git init` here would make it openable. Lets callers offer init
   *  without inferring intent from the error string. */
  needsInit?: boolean
}

/** Resolve a user-entered path to absolute, expanding a leading `~` to $HOME. */
function toAbsolute(dir: string): string {
  return resolve(dir.replace(/^~(?=$|\/)/, homedir()))
}

/**
 * Validate that `dir` can be opened as a project: it must exist, be a directory,
 * and be a git repository (worktrees branch off it, §6.1). Resolves the default
 * branch so the engine and WorktreeManager agree on the base branch.
 */
export async function validateProjectDir(dir: string): Promise<ProjectDirInfo> {
  const path = toAbsolute(dir)
  if (!existsSync(path)) return { ok: false, path, error: 'Folder does not exist' }
  try {
    if (!statSync(path).isDirectory())
      return { ok: false, path, error: 'Not a folder' }
  } catch {
    return { ok: false, path, error: 'Cannot read folder' }
  }

  // Must be the top level of a git repo (where `.git` lives) — worktree add is run
  // against this root. A subdirectory of a repo would put `.freebuff/` in the wrong
  // place, so require `.git` here rather than walking up.
  if (!existsSync(join(path, '.git'))) {
    const enclosing = findEnclosingRepoRoot(path)
    if (enclosing)
      return {
        ok: false,
        path,
        error: `This folder is inside the git repository at ${enclosing} — open that folder instead`,
      }
    return {
      ok: false,
      path,
      error: 'Not a git repository (run `git init` here first)',
      needsInit: true,
    }
  }

  const defaultBranch = await detectDefaultBranch(path)
  return { ok: true, path, defaultBranch }
}

/**
 * `git init` a folder so it can be opened as a project. Idempotent (a folder
 * that's already a repo is returned as-is). Makes an initial commit — with
 * `--allow-empty` so even an empty folder gets one — because task worktrees
 * (`git worktree add`) need at least one commit to branch from. A fallback git
 * identity is set locally ONLY when the user has none configured, so real
 * commits keep the user's own name/email.
 */
export async function initProjectRepo(dir: string): Promise<ProjectDirInfo> {
  const path = toAbsolute(dir)
  if (existsSync(join(path, '.git'))) return validateProjectDir(path)
  if (!existsSync(path)) return { ok: false, path, error: 'Folder does not exist' }
  try {
    if (!statSync(path).isDirectory())
      return { ok: false, path, error: 'Not a folder' }
  } catch {
    return { ok: false, path, error: 'Cannot read folder' }
  }

  // Never nest a repo inside an existing one — `git init` in a subfolder of a
  // real repo would silently corrupt the user's project layout.
  const enclosing = findEnclosingRepoRoot(path)
  if (enclosing)
    return {
      ok: false,
      path,
      error: `This folder is inside the git repository at ${enclosing} — open that folder instead`,
    }

  const git = (args: string[]) => bunRunner.run('git', ['-C', path, ...args])

  const init = await bunRunner.run('git', ['init', '-b', 'main', path])
  if (init.exitCode !== 0)
    return { ok: false, path, error: `git init failed: ${init.stderr.trim()}` }

  if (!(await git(['config', 'user.email'])).stdout.trim()) {
    await git(['config', 'user.email', 'desktop@freebuff.local'])
    await git(['config', 'user.name', 'Freebuff Desktop'])
  }

  await git(['add', '-A'])
  const commit = await git(['commit', '--allow-empty', '-m', 'Initial commit'])
  if (commit.exitCode !== 0)
    return { ok: false, path, error: `git commit failed: ${commit.stderr.trim()}` }

  return validateProjectDir(path)
}

/** Nearest ancestor of `path` (strictly above it) that contains `.git`, or null.
 *  Used to distinguish "not a repo yet" (offer `git init`) from "subfolder of an
 *  existing repo" (must not be opened or initialized — worktrees/`.freebuff`
 *  would land in the wrong place, and `git init` would nest a repo). */
function findEnclosingRepoRoot(path: string): string | null {
  let dir = dirname(path)
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** The repo's current branch — the base every task worktree branches from (§8). */
async function detectDefaultBranch(repoRoot: string): Promise<string> {
  const r = await bunRunner.run('git', [
    '-C',
    repoRoot,
    'symbolic-ref',
    '--short',
    'HEAD',
  ])
  const branch = r.stdout.trim()
  return branch || 'main'
}

// — Last-opened persistence (§6.2): reopening the app returns to the same project —
//
// The state file tracks a small MRU list of recently-opened repos so the
// orchestrator can pick up where the last session left off on launch.

const STATE_PATH = join(homedir(), '.config', 'freebuff-desktop', 'state.json')

/** Cap on how many recent projects we keep. Keeps the state file small. */
const MAX_RECENTS = 8

/** Read the whole settings blob (last project + agent harness, …). */
function readState(): Record<string, unknown> {
  try {
    const data = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Merge a patch into the settings blob (preserves the other keys). */
function writeState(patch: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify({ ...readState(), ...patch }, null, 2))
  } catch {
    // Best-effort; a missing state file just means we fall back to defaults.
  }
}

/** Coerce a stored value into an MRU list of distinct repo paths. Older
 *  `lastProject: string` entries are migrated in (prepended). Garbage entries
 *  are dropped. */
function coerceRecents(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, MAX_RECENTS)
  }
  if (typeof value === 'string' && value.length > 0) return [value]
  return []
}

export function readLastProject(): string | undefined {
  // Back-compat shim: prefer the MRU list, then the legacy single value.
  const recents = coerceRecents(readState().recentProjects)
  if (recents.length) return recents[0]
  const legacy = readState().lastProject
  return typeof legacy === 'string' ? legacy : undefined
}

export function writeLastProject(path: string): void {
  // Kept as a thin shim — the canonical write path now goes through
  // `pushRecentProject` so the MRU list is maintained. Reporting the write
  // through this entry point keeps existing callers honest without forcing
  // them to know about the list shape.
  pushRecentProject(path)
}

/** Return the persisted MRU list of recently-opened projects (most recent first).
 *  Falls back to the legacy `lastProject` value while older state files exist. */
export function readRecentProjects(): string[] {
  const list = coerceRecents(readState().recentProjects)
  if (list.length) return list
  const legacy = readState().lastProject
  return typeof legacy === 'string' && legacy.length ? [legacy] : []
}

/** Push a project path to the front of the MRU list, deduping and capping at
 *  MAX_RECENTS. Best-effort: a write failure (disk / permissions) is swallowed
 *  because the app should still launch even if its state file is unwritable. */
export function pushRecentProject(path: string): void {
  if (!path) return
  const prev = readRecentProjects()
  const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_RECENTS)
  writeState({ recentProjects: next })
}

/**
 * Per-user UI preferences (layout knobs like the queue-panel width). Persisted
 * here rather than renderer localStorage: the packaged app serves the UI from
 * a random localhost port each launch, so origin-keyed storage resets on every
 * restart. Served via /api/settings/ui.
 */
export interface UiPrefs {
  /** Width of the right-hand queue panel, in px. */
  queueWidth?: number
}

export function readUiPrefs(): UiPrefs {
  const v = readState().uiPrefs
  if (!v || typeof v !== 'object') return {}
  const obj = v as Record<string, unknown>
  const prefs: UiPrefs = {}
  if (typeof obj.queueWidth === 'number' && Number.isFinite(obj.queueWidth)) {
    prefs.queueWidth = obj.queueWidth
  }
  return prefs
}

export function writeUiPrefs(patch: UiPrefs): void {
  writeState({ uiPrefs: { ...readUiPrefs(), ...patch } })
}

/** The persisted agent-harness choice (id string; validated by the caller). */
export function readAgentHarness(): string | undefined {
  const v = readState().agentHarness
  return typeof v === 'string' ? v : undefined
}

export function writeAgentHarness(id: string): void {
  writeState({ agentHarness: id })
}

/** Minimal persisted identity for the logged-in Freebuff user. The auth token
 *  is the bearer the desktop sends to the Freebuff API (chat-completions +
 *  /freebuff/session), exactly like the CLI's saved credentials. */
export interface DesktopAuthUser {
  id?: string
  name?: string
  email?: string
}

/** The persisted Freebuff auth token (the user's API key / authToken). Absent
 *  when not signed in; callers fall back to the env CODEBUFF_API_KEY for dev. */
export function readAuthToken(): string | undefined {
  const v = readState().authToken
  return typeof v === 'string' && v.length ? v : undefined
}

export function writeAuthToken(token: string): void {
  writeState({ authToken: token })
}

export function readAuthUser(): DesktopAuthUser | undefined {
  const v = readState().authUser
  return v && typeof v === 'object' ? (v as DesktopAuthUser) : undefined
}

export function writeAuthUser(user: DesktopAuthUser): void {
  writeState({ authUser: user })
}

/** Clear the persisted auth token + user (logout). */
export function clearAuth(): void {
  writeState({ authToken: undefined, authUser: undefined })
}

/**
 * A stable, per-install anonymous analytics id. Pre-login events (app_launched,
 * the first turns before sign-in) are captured under this id and later aliased
 * to the real user id on login, so a user's pre-auth and post-auth activity
 * collapse to one PostHog person. Minted once and persisted; deliberately a
 * random UUID (not a hardware fingerprint) so a reinstall doesn't bleed into a
 * previous user's identity. Mirrors the CLI's `analytics-id.json`, but kept in
 * the desktop's own state file so the two surfaces stay independent.
 */
export function getOrCreateAnalyticsId(): string {
  const existing = readState().analyticsId
  if (typeof existing === 'string' && existing.length) return existing
  const minted = `anon_${crypto.randomUUID()}`
  writeState({ analyticsId: minted })
  return minted
}
