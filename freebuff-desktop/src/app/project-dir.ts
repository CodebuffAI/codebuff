/**
 * Project directory resolution for "open a folder" (§6.2). The desktop app points
 * the orchestrator at a real local git repo the user chooses at runtime, instead of
 * a fixed startup path. This module owns:
 *
 *  - validateProjectDir()  — is this path a usable project root? (exists, is a dir,
 *                            is a git repo) and what's its default branch.
 *  - browseDir()           — list a directory's subfolders so the renderer can offer
 *                            a folder picker without a native OS dialog (no Electron
 *                            shell yet; the UI runs in a plain browser).
 *  - last-opened persistence so reopening the app returns to the same project.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
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
  if (!existsSync(join(path, '.git')))
    return {
      ok: false,
      path,
      error: 'Not a git repository (run `git init` here first)',
    }

  const defaultBranch = await detectDefaultBranch(path)
  return { ok: true, path, defaultBranch }
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

export interface BrowseEntry {
  name: string
  path: string
  /** True if this subfolder is itself a git repo — openable as a project. */
  isRepo: boolean
}

export interface BrowseResult {
  path: string
  /** Parent dir, or null at the filesystem root. */
  parent: string | null
  /** Is the browsed path itself an openable git repo? */
  isRepo: boolean
  entries: BrowseEntry[]
}

/**
 * List the subdirectories of `dir` for the folder picker. Hidden dirs and common
 * heavy/uninteresting folders are skipped. Defaults to the user's home directory.
 */
export function browseDir(dir?: string): BrowseResult {
  const path = toAbsolute(dir || homedir())
  const SKIP = new Set(['node_modules', '.git', '.freebuff'])
  let entries: BrowseEntry[] = []
  try {
    entries = readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !SKIP.has(d.name) && !d.name.startsWith('.'))
      .map((d) => {
        const full = join(path, d.name)
        return { name: d.name, path: full, isRepo: existsSync(join(full, '.git')) }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    // Unreadable dir — return empty list rather than failing the request.
  }
  const parent = dirname(path)
  return {
    path,
    parent: parent === path ? null : parent,
    isRepo: existsSync(join(path, '.git')),
    entries,
  }
}

// — Last-opened persistence (§6.2): reopening the app returns to the same project —

const STATE_PATH = join(homedir(), '.config', 'freebuff-desktop', 'state.json')

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

export function readLastProject(): string | undefined {
  const v = readState().lastProject
  return typeof v === 'string' ? v : undefined
}

export function writeLastProject(path: string): void {
  writeState({ lastProject: path })
}

/** The persisted agent-harness choice (id string; validated by the caller). */
export function readAgentHarness(): string | undefined {
  const v = readState().agentHarness
  return typeof v === 'string' ? v : undefined
}

export function writeAgentHarness(id: string): void {
  writeState({ agentHarness: id })
}
