/**
 * The counted half of a workspace profile: file count, lines of code and the
 * language mix, computed by the client from the project's files rather than
 * estimated by the profiler's model. Counts and language names only — never a
 * path or file content — so it is safe to send.
 */
import z from 'zod/v4'

import { WORKSPACE_PROFILE_SIZE_SECTION } from './template'

import type { WorkspaceProfile } from './template'

type LanguageKind = 'code' | 'markup' | 'data' | 'prose'

type Language = { name: string; kind: LanguageKind }

const lang = (name: string, kind: LanguageKind = 'code'): Language => ({
  name,
  kind,
})

const BY_EXTENSION: Readonly<Record<string, Language>> = {
  '.ts': lang('TypeScript'),
  '.tsx': lang('TypeScript'),
  '.mts': lang('TypeScript'),
  '.cts': lang('TypeScript'),
  '.js': lang('JavaScript'),
  '.jsx': lang('JavaScript'),
  '.mjs': lang('JavaScript'),
  '.cjs': lang('JavaScript'),
  '.py': lang('Python'),
  '.pyi': lang('Python'),
  '.ipynb': lang('Jupyter Notebook', 'data'),
  '.rb': lang('Ruby'),
  '.go': lang('Go'),
  '.rs': lang('Rust'),
  '.java': lang('Java'),
  '.kt': lang('Kotlin'),
  '.kts': lang('Kotlin'),
  '.scala': lang('Scala'),
  '.groovy': lang('Groovy'),
  '.swift': lang('Swift'),
  '.m': lang('Objective-C'),
  '.mm': lang('Objective-C'),
  '.c': lang('C'),
  '.h': lang('C'),
  '.cc': lang('C++'),
  '.cpp': lang('C++'),
  '.cxx': lang('C++'),
  '.hpp': lang('C++'),
  '.hh': lang('C++'),
  '.cs': lang('C#'),
  '.fs': lang('F#'),
  '.vb': lang('Visual Basic'),
  '.php': lang('PHP'),
  '.dart': lang('Dart'),
  '.lua': lang('Lua'),
  '.r': lang('R'),
  '.jl': lang('Julia'),
  '.ex': lang('Elixir'),
  '.exs': lang('Elixir'),
  '.erl': lang('Erlang'),
  '.hs': lang('Haskell'),
  '.ml': lang('OCaml'),
  '.clj': lang('Clojure'),
  '.zig': lang('Zig'),
  '.nim': lang('Nim'),
  '.sol': lang('Solidity'),
  '.pl': lang('Perl'),
  '.sh': lang('Shell'),
  '.bash': lang('Shell'),
  '.zsh': lang('Shell'),
  '.fish': lang('Shell'),
  '.ps1': lang('PowerShell'),
  '.bat': lang('Batch'),
  '.cmd': lang('Batch'),
  '.sql': lang('SQL'),
  '.prisma': lang('Prisma'),
  '.graphql': lang('GraphQL'),
  '.gql': lang('GraphQL'),
  '.proto': lang('Protocol Buffers'),
  '.tf': lang('HCL'),
  '.hcl': lang('HCL'),
  '.gd': lang('GDScript'),
  '.glsl': lang('GLSL'),
  '.wgsl': lang('WGSL'),
  '.asm': lang('Assembly'),
  '.s': lang('Assembly'),
  '.vue': lang('Vue'),
  '.svelte': lang('Svelte'),
  '.astro': lang('Astro'),
  '.html': lang('HTML', 'markup'),
  '.htm': lang('HTML', 'markup'),
  '.css': lang('CSS', 'markup'),
  '.scss': lang('SCSS', 'markup'),
  '.sass': lang('SCSS', 'markup'),
  '.less': lang('Less', 'markup'),
  '.xml': lang('XML', 'data'),
  '.json': lang('JSON', 'data'),
  '.jsonc': lang('JSON', 'data'),
  '.yaml': lang('YAML', 'data'),
  '.yml': lang('YAML', 'data'),
  '.toml': lang('TOML', 'data'),
  '.csv': lang('CSV', 'data'),
  '.md': lang('Markdown', 'prose'),
  '.mdx': lang('MDX', 'prose'),
  '.rst': lang('reStructuredText', 'prose'),
  '.txt': lang('Text', 'prose'),
}

const BY_FILENAME: Readonly<Record<string, Language>> = {
  dockerfile: lang('Dockerfile'),
  makefile: lang('Makefile'),
  gemfile: lang('Ruby'),
  rakefile: lang('Ruby'),
  justfile: lang('Just'),
}

/** Lockfiles and generated bundles: real files, not code anyone wrote. */
const UNCOUNTED_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'uv.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
  'podfile.lock',
  'pubspec.lock',
  'mix.lock',
  'flake.lock',
])

// No node:path: this module also runs where Node's built-ins do not.
function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
}

function extension(base: string): string {
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot) : ''
}

export function languageForPath(filePath: string): Language | null {
  const base = baseName(filePath)
  if (UNCOUNTED_FILENAMES.has(base)) return null
  if (/\.min\.(js|css)$/.test(base) || base.endsWith('.map')) return null
  if (BY_FILENAME[base]) return BY_FILENAME[base]
  if (base.startsWith('dockerfile.')) return BY_FILENAME.dockerfile
  return BY_EXTENSION[extension(base)] ?? null
}

const TEST_PATH =
  /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z0-9]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/i

export function isTestPath(filePath: string): boolean {
  return TEST_PATH.test(filePath.replace(/\\/g, '/'))
}

/** Lines in a file's text, counting a final line with no newline. */
export function countLines(content: string): number {
  if (content.length === 0) return 0
  let lines = 0
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lines++
  }
  return content.charCodeAt(content.length - 1) === 10 ? lines : lines + 1
}

/** Most languages a profile lists, by lines. */
export const WORKSPACE_STATS_MAX_LANGUAGES = 20

export const workspaceStatsSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  /** The listing stopped at a cap, so the project has at least this many. */
  fileCountIsLowerBound: z.boolean(),
  testFileCount: z.number().int().nonnegative(),
  /** Lines in files of a programming language (`code` kind). */
  codeLineCount: z.number().int().nonnegative(),
  /** Some files were too large or too many to read, so lines are a floor. */
  lineCountIsLowerBound: z.boolean(),
  languages: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        kind: z.enum(['code', 'markup', 'data', 'prose']),
        files: z.number().int().nonnegative(),
        lines: z.number().int().nonnegative(),
      }),
    )
    .max(WORKSPACE_STATS_MAX_LANGUAGES),
})

export type WorkspaceStats = z.infer<typeof workspaceStatsSchema>

export type WorkspaceStatsFile = {
  path: string
  /** Lines in the file, when it was read; unread files count toward the file
   *  and language totals but not the line totals. */
  lines?: number
}

export function computeWorkspaceStats(params: {
  files: readonly WorkspaceStatsFile[]
  fileCountIsLowerBound: boolean
}): WorkspaceStats {
  const byLanguage = new Map<
    string,
    { name: string; kind: LanguageKind; files: number; lines: number }
  >()
  let testFileCount = 0
  let codeLineCount = 0
  let unread = false
  for (const file of params.files) {
    if (isTestPath(file.path)) testFileCount++
    const language = languageForPath(file.path)
    if (!language) continue
    const entry = byLanguage.get(language.name) ?? {
      ...language,
      files: 0,
      lines: 0,
    }
    entry.files++
    if (file.lines === undefined) unread = true
    else {
      entry.lines += file.lines
      if (language.kind === 'code') codeLineCount += file.lines
    }
    byLanguage.set(language.name, entry)
  }
  const languages = [...byLanguage.values()]
    .sort((a, b) => b.lines - a.lines || b.files - a.files)
    .slice(0, WORKSPACE_STATS_MAX_LANGUAGES)
  return {
    fileCount: params.files.length,
    fileCountIsLowerBound: params.fileCountIsLowerBound,
    testFileCount,
    codeLineCount,
    lineCountIsLowerBound: unread || params.fileCountIsLowerBound,
    languages,
  }
}

/** The budget a client reads files under to count lines. Past it, files still
 *  count toward the totals but their lines do not. */
export const WORKSPACE_STATS_READ_LIMITS = {
  maxFiles: 10_000,
  maxFileBytes: 1_000_000,
  maxTotalBytes: 100_000_000,
} as const

/** Whether a path is worth reading to count lines. */
export function shouldCountLines(filePath: string): boolean {
  return languageForPath(filePath) !== null
}

/** The `size` section of a stored profile: the client's stats, keyed like the
 *  template's fields. */
export type WorkspaceProfileSize = {
  file_count: number
  file_count_is_lower_bound: boolean
  test_file_count: number
  code_line_count: number
  line_count_is_lower_bound: boolean
  languages: Array<{ name: string; kind: string; files: number; lines: number }>
}

/** What `workspace_profile.profile` holds: the template's sections as the
 *  profiler answered them, plus the counted `size` section. */
export type StoredWorkspaceProfile = Record<string, Record<string, unknown>>

export function toWorkspaceProfileSize(
  stats: WorkspaceStats,
): WorkspaceProfileSize {
  return {
    file_count: stats.fileCount,
    file_count_is_lower_bound: stats.fileCountIsLowerBound,
    test_file_count: stats.testFileCount,
    code_line_count: stats.codeLineCount,
    line_count_is_lower_bound: stats.lineCountIsLowerBound,
    languages: stats.languages.map((language) => ({ ...language })),
  }
}

/**
 * One profile to store: the (already normalized) answers, then `size` from the
 * client's counts. `size` is written last, so it is always the counts and never
 * anything the model's answer carried under that key.
 */
export function buildStoredWorkspaceProfile(
  answers: WorkspaceProfile,
  stats: WorkspaceStats,
): StoredWorkspaceProfile {
  return {
    ...answers,
    [WORKSPACE_PROFILE_SIZE_SECTION]: toWorkspaceProfileSize(stats),
  }
}
