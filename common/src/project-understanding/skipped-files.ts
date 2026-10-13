/**
 * Text files the project-understanding agent never reads, because their names
 * already say what they could: lockfiles, generated files and files too large
 * to be a manifest or config file. A live run on a six-file Python project
 * spent most of ~100k input tokens reading `uv.lock`, whose name alone says
 * the project uses uv (docs/freebuff-project-understanding.md).
 *
 * Shared by the SDK's opt-in read guard (`RunOptions.refuseNonTextFileReads`)
 * and the Cloud project-understanding agent's read_files wrapper, so both
 * refuse the same files. Project-understanding-only, like non-text-files.ts:
 * no other read path imports it. No node:path here: this module also runs
 * where Node's built-ins do not.
 */
import { FILE_READ_STATUS } from '../constants/paths'

/** Lockfiles by exact base name, lower-case. The patterns below catch the
 *  rest of the `*.lock` / `*-lock.*` family. */
export const PROJECT_UNDERSTANDING_LOCKFILE_NAMES: ReadonlySet<string> =
  new Set([
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
    'deno.lock',
    'cargo.lock',
    'poetry.lock',
    'pipfile.lock',
    'uv.lock',
    'pdm.lock',
    'conda-lock.yml',
    'composer.lock',
    'gemfile.lock',
    'go.sum',
    'go.work.sum',
    'podfile.lock',
    'package.resolved',
    'pubspec.lock',
    'mix.lock',
    'flake.lock',
    'packages.lock.json',
    'gradle.lockfile',
    '.terraform.lock.hcl',
  ])

/** `x.lock`, `x.lockb`, `x.lockfile`, and `x-lock.json` / `x.lock.json` and
 *  their YAML, TOML and HCL kin. */
const LOCKFILE_PATTERN =
  /(\.lock|\.lockb|\.lockfile|[.-]lock\.(json|ya?ml|toml|hcl))$/

/** Built or minified output, by base name. */
const GENERATED_FILE_PATTERN = /\.(min\.(js|mjs|cjs|css)|bundle\.js|map)$/

/** Directories that hold installed dependencies, build output or caches, never
 *  the project's own manifests. Lower-case; matched against any directory
 *  segment of a project-relative path. */
export const PROJECT_UNDERSTANDING_GENERATED_DIRECTORIES: ReadonlySet<string> =
  new Set([
    'node_modules',
    'bower_components',
    'vendor',
    '.venv',
    'venv',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.tox',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.turbo',
    'target',
    '.gradle',
    'pods',
    '.dart_tool',
    '.terraform',
  ])

/** Text files over this are not read: every manifest and config file the
 *  agent wants is far smaller. Checked before reading wherever a size is
 *  known. */
export const PROJECT_UNDERSTANDING_MAX_READ_BYTES = 100 * 1024

export const PROJECT_UNDERSTANDING_LOCKFILE_MESSAGE =
  '[Lockfile: its name says which package manager the project uses; not read. The manifest beside it lists the dependencies.]'

export const PROJECT_UNDERSTANDING_GENERATED_MESSAGE =
  '[Generated or dependency file: not source or config the project wrote; not read. Its path is evidence enough.]'

export const PROJECT_UNDERSTANDING_TOO_LARGE_MESSAGE =
  '[Over 100 KB: too large to be a manifest or config file; not read. Rely on its name.]'

/** Whether a path names a lockfile (by its base name). Paths only: no read.
 *  The file counter (stats.ts) leaves these out too. */
export function isProjectUnderstandingLockfile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  const base = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  return (
    PROJECT_UNDERSTANDING_LOCKFILE_NAMES.has(base) ||
    LOCKFILE_PATTERN.test(base)
  )
}

/**
 * Why the project-understanding agent must not read this file, as a whole
 * read_files result (status and message), or `null` when it may.
 *
 * `relativePath` is project-relative (a directory above the project named
 * `build` must not refuse everything). `sizeBytes`, when known, adds the
 * size cap; pass it from a stat so an oversized file is never loaded.
 */
export function projectUnderstandingReadRefusal(
  relativePath: string,
  sizeBytes?: number,
): string | null {
  const segments = relativePath
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
  const base = (segments.pop() ?? '').toLowerCase()
  if (isProjectUnderstandingLockfile(base)) {
    return `${FILE_READ_STATUS.IGNORED} ${PROJECT_UNDERSTANDING_LOCKFILE_MESSAGE}`
  }
  if (
    GENERATED_FILE_PATTERN.test(base) ||
    segments.some((segment) =>
      PROJECT_UNDERSTANDING_GENERATED_DIRECTORIES.has(segment.toLowerCase()),
    )
  ) {
    return `${FILE_READ_STATUS.IGNORED} ${PROJECT_UNDERSTANDING_GENERATED_MESSAGE}`
  }
  if (
    sizeBytes !== undefined &&
    sizeBytes > PROJECT_UNDERSTANDING_MAX_READ_BYTES
  ) {
    return `${FILE_READ_STATUS.TOO_LARGE} ${PROJECT_UNDERSTANDING_TOO_LARGE_MESSAGE}`
  }
  return null
}
