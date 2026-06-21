/**
 * Helpers for resolving and reading durable plan-session artifacts
 * stored under `.agents/sessions/<slug>/` in the project root.
 */
import fs from 'fs'
import path from 'path'

import { getProjectRoot } from '../project-files'

export const PLAN_ARTIFACT_NAMES = [
  'SPEC.md',
  'PLAN.md',
  'STATUS.md',
  'LESSONS.md',
] as const

export type PlanArtifactName = (typeof PLAN_ARTIFACT_NAMES)[number]

/**
 * Max bytes read per plan artifact when assembling the prompt. Keeps prompts
 * bounded even when users accidentally write huge SPEC.md/LESSONS.md files.
 */
export const MAX_ARTIFACT_BYTES = 64 * 1024

export type PlanArtifacts = {
  /** Project-relative session directory (e.g. ".agents/sessions/foo"). */
  sessionDir: string
  /** Absolute resolved session directory. */
  absSessionDir: string
  /** Map of artifact name -> contents (only present for files that exist). */
  files: Partial<Record<PlanArtifactName, string>>
  /** Project-relative paths for files that exist. */
  presentPaths: Partial<Record<PlanArtifactName, string>>
  /** Artifact names that were not found on disk. */
  missing: PlanArtifactName[]
  /** Artifact names that were truncated because the file exceeded MAX_ARTIFACT_BYTES. */
  truncated: PlanArtifactName[]
}

export type PlanSessionSummary = {
  /** Session slug under .agents/sessions. */
  slug: string
  /** Project-relative session directory (e.g. ".agents/sessions/foo"). */
  sessionDir: string
  /** Absolute resolved session directory. */
  absSessionDir: string
  /** Artifact names present in this session. */
  artifacts: PlanArtifactName[]
}

type ResolveResult =
  | { ok: true; sessionDir: string; absSessionDir: string }
  | { ok: false; error: string }

/**
 * Normalize a user-supplied session path: handle backslashes, leading "./",
 * and (when not absolute) a single bare slug. Absolute paths are returned
 * as-is so the caller can decide whether to reject them.
 */
function normalizeSessionInput(input: string): string {
  let rel = input.trim().replace(/\\/g, '/')
  while (rel.startsWith('./')) rel = rel.slice(2)
  if (rel.endsWith('.md')) rel = path.posix.dirname(rel)
  if (!rel.includes('/') && rel.length > 0) {
    rel = `.agents/sessions/${rel}`
  }
  return rel
}

/**
 * Resolve a user-provided session slug or path to a `.agents/sessions/<slug>`
 * directory under the project root. Rejects path traversal that escapes
 * the project root.
 */
export function resolvePlanSessionDir(input: string): ResolveResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: 'Missing session slug or path.' }
  }

  const projectRoot = getProjectRoot()
  const rel = normalizeSessionInput(trimmed)

  const abs = path.resolve(projectRoot, rel)
  const rootWithSep = projectRoot.endsWith(path.sep)
    ? projectRoot
    : projectRoot + path.sep
  if (abs !== projectRoot && !abs.startsWith(rootWithSep)) {
    return { ok: false, error: 'Resolved session path escapes the project root.' }
  }

  // Use forward slashes for the project-relative display form.
  const sessionDir = path
    .relative(projectRoot, abs)
    .split(path.sep)
    .join('/')

  return { ok: true, sessionDir, absSessionDir: abs }
}

/**
 * Read whichever plan artifacts exist under the given session directory.
 * Returns `null` if the session directory does not exist on disk. Artifacts
 * larger than MAX_ARTIFACT_BYTES are truncated to keep prompts bounded.
 */
export function readPlanArtifacts(input: string): PlanArtifacts | null {
  const resolved = resolvePlanSessionDir(input)
  if (!resolved.ok) return null
  if (!fs.existsSync(resolved.absSessionDir)) return null

  const files: Partial<Record<PlanArtifactName, string>> = {}
  const presentPaths: Partial<Record<PlanArtifactName, string>> = {}
  const missing: PlanArtifactName[] = []
  const truncated: PlanArtifactName[] = []

  for (const name of PLAN_ARTIFACT_NAMES) {
    const abs = path.join(resolved.absSessionDir, name)
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const raw = fs.readFileSync(abs, 'utf8')
      if (raw.length > MAX_ARTIFACT_BYTES) {
        const head = raw.slice(0, MAX_ARTIFACT_BYTES)
        const dropped = raw.length - head.length
        files[name] = `${head}\n\n[...truncated ${dropped} chars to keep prompt bounded; read the file directly for full contents...]`
        truncated.push(name)
      } else {
        files[name] = raw
      }
      presentPaths[name] = `${resolved.sessionDir}/${name}`
    } else {
      missing.push(name)
    }
  }

  return {
    sessionDir: resolved.sessionDir,
    absSessionDir: resolved.absSessionDir,
    files,
    presentPaths,
    missing,
    truncated,
  }
}

/**
 * Format the artifact contents for inclusion in an agent prompt.
 */
export function formatArtifactsForPrompt(artifacts: PlanArtifacts): string {
  const sections: string[] = []
  for (const name of PLAN_ARTIFACT_NAMES) {
    const content = artifacts.files[name]
    if (content === undefined) continue
    sections.push(
      `--- BEGIN ${artifacts.sessionDir}/${name} ---\n${content.trimEnd()}\n--- END ${artifacts.sessionDir}/${name} ---`,
    )
  }
  return sections.join('\n\n')
}

/**
 * Returns true if the artifact set contains at least one of the four files.
 */
export function hasAnyArtifact(artifacts: PlanArtifacts | null): boolean {
  return !!artifacts && Object.keys(artifacts.files).length > 0
}

/**
 * List durable plan sessions under `.agents/sessions/*` that contain at least
 * one known plan artifact. Directories are returned newest first by mtime.
 */
export function listPlanSessions(): PlanSessionSummary[] {
  const projectRoot = getProjectRoot()
  const sessionsRoot = path.join(projectRoot, '.agents', 'sessions')
  if (!fs.existsSync(sessionsRoot)) return []

  const rootWithSep = sessionsRoot.endsWith(path.sep)
    ? sessionsRoot
    : sessionsRoot + path.sep

  return fs
    .readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const absSessionDir = path.resolve(sessionsRoot, entry.name)
      if (!absSessionDir.startsWith(rootWithSep)) return null

      const artifacts = PLAN_ARTIFACT_NAMES.filter((name) => {
        const artifactPath = path.join(absSessionDir, name)
        return fs.existsSync(artifactPath) && fs.statSync(artifactPath).isFile()
      })

      if (artifacts.length === 0) return null

      return {
        slug: entry.name,
        sessionDir: `.agents/sessions/${entry.name}`,
        absSessionDir,
        artifacts,
        mtimeMs: fs.statSync(absSessionDir).mtimeMs,
      }
    })
    .filter(
      (
        session,
      ): session is PlanSessionSummary & { mtimeMs: number } =>
        session !== null,
    )
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.slug.localeCompare(b.slug))
    .map(({ mtimeMs: _mtimeMs, ...session }) => session)
}
