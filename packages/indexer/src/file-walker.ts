import * as fs from 'node:fs'
import * as path from 'node:path'

import ignore from 'ignore'
import { isMandatorySensitiveReadPath } from '@codebuff/common/util/sensitive-paths'

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.bun-install',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  'coverage',
  '.cache',
  '.codebuff-index',
  '.omx',
  'tmp',
  '.tmp',
  'out',
])

const MAX_FILE_SIZE = 500_000 // 500KB
const DEFAULT_MAX_FILES = 20_000

function isGeneratedOperationalArtifact(relativePath: string): boolean {
  return (
    relativePath === '.agents/sessions' ||
    relativePath.startsWith('.agents/sessions/') ||
    /^evals\/buffbench\/[^/]+-base2-lite-error-[^/]+\.json$/i.test(
      relativePath,
    )
  )
}

export interface WalkProjectResult {
  files: WalkedFile[]
  truncated: boolean
  maxFiles: number
  skippedFiles: number
  skippedPrefixes: string[]
}

/**
 * Binary file extensions that should be skipped during indexing. These files
 * are either binary assets (game engine, 3D models, textures, audio) or
 * file types that cannot be meaningfully parsed as UTF-8 text. Skipping them
 * avoids corrupting the indexer with garbage from binary-reading-as-text and
 * keeps the file count budget available for source files.
 *
 * Game engine binary formats: .uasset, .umap, .assets, .fbx, .obj, .dae,
 * .3ds, .blend. Unity .meta/.prefab/.unity are NOT here — they are YAML text
 * in Unity's text serialization mode and are parsed for asset references.
 *
 * Standard binary/media formats already handled by the size filter or the
 * truncation filter are included here too for defense-in-depth at the walk
 * stage so they never even get stat'd or hashed.
 */
export const BINARY_EXTENSIONS = new Set([
  // Game engine binary asset formats. Unity .meta/.prefab/.unity are
  // intentionally NOT here — they are text (YAML) in Unity's text
  // serialization mode and are parsed for asset references by the indexer.
  '.uasset',
  '.umap',
  '.assets',
  '.fbx',
  '.obj',
  '.dae',
  '.3ds',
  '.blend',

  // Image / texture formats
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
  '.webp',
  '.ico',
  '.svg',
  '.dds',
  '.tga',
  '.psd',
  '.exr',
  '.hdr',

  // Audio formats
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.m4a',
  '.wma',
  '.opus',

  // Video formats
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.wmv',
  '.flv',

  // 3D / animation binary formats
  '.anim',
  '.controller',
  '.mat',
  '.cub',
  '.physicmaterial',

  // Compiled / packaged formats
  '.class',
  '.jar',
  '.war',
  '.dll',
  '.lib',
  '.exe',
  '.so',
  '.dylib',
  '.o',
  '.a',

  // Compressed archives
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.bz2',
  '.xz',
  '.dmg',
  '.iso',
  '.pkg',
  '.deb',
  '.rpm',

  // Binary containers
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.epub',
  '.sqlite',
  '.db',
  '.bin',
  '.dat',
])

export interface WalkedFile {
  absolutePath: string
  relativePath: string
  ext: string
  mtime: number
  size: number
}

export async function walkProject(
  projectRoot: string,
  extraExclude: string[] = [],
): Promise<WalkedFile[]> {
  return (await walkProjectDetailed(projectRoot, extraExclude)).files
}

export async function walkProjectDetailed(
  projectRoot: string,
  extraExclude: string[] = [],
  maxFiles = DEFAULT_MAX_FILES,
): Promise<WalkProjectResult> {
  const extraExcludeSet = new Set(extraExclude)
  const candidatesByPrefix = new Map<string, WalkedFile[]>()
  const eligibleCountsByPrefix = new Map<string, number>()

  type ScopedMatcher = { base: string; matcher: ReturnType<typeof ignore> }

  async function walk(dir: string, parents: ScopedMatcher[]): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))
    const directoryMatcher = ignore().add([
      ...loadIgnorePatterns(path.join(dir, '.gitignore')),
      ...loadIgnorePatterns(path.join(dir, '.openbuffignore')),
      ...loadIgnorePatterns(path.join(dir, '.codebuffignore')),
      ...(dir === projectRoot ? extraExclude : []),
    ])
    const matchers = [...parents, { base: dir, matcher: directoryMatcher }]
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = normalizeRelativePath(path.relative(projectRoot, abs))
      const ignored = matchers.some(({ base, matcher }) => {
        const scoped = normalizeRelativePath(path.relative(base, abs))
        return scoped && matcher.ignores(entry.isDirectory() ? `${scoped}/` : scoped)
      })

      if (entry.isDirectory()) {
        if (
          DEFAULT_EXCLUDE_DIRS.has(entry.name) ||
          extraExcludeSet.has(entry.name) ||
          isGeneratedOperationalArtifact(rel)
        ) {
          continue
        }
        if (ignored) continue
        await walk(abs, matchers)
      } else if (entry.isFile()) {
        if (
          ignored ||
          isMandatorySensitiveReadPath(rel) ||
          isGeneratedOperationalArtifact(rel)
        )
          continue
        let stat: fs.Stats
        try {
          stat = await fs.promises.stat(abs)
        } catch {
          continue
        }
        if (stat.size > MAX_FILE_SIZE) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (BINARY_EXTENSIONS.has(ext)) continue
        const prefix = rel.includes('/') ? (rel.split('/')[0] ?? rel) : '<root>'
        eligibleCountsByPrefix.set(
          prefix,
          (eligibleCountsByPrefix.get(prefix) ?? 0) + 1,
        )
        const prefixCandidates = candidatesByPrefix.get(prefix) ?? []
        if (prefixCandidates.length >= maxFiles) continue
        prefixCandidates.push({
          absolutePath: abs,
          relativePath: normalizeRelativePath(rel),
          ext,
          mtime: stat.mtimeMs,
          size: stat.size,
        })
        candidatesByPrefix.set(prefix, prefixCandidates)
      }
    }
  }

  await walk(projectRoot, [])
  const prefixes = [...candidatesByPrefix.keys()].sort()
  const offsets = new Map(prefixes.map((prefix) => [prefix, 0]))
  const results: WalkedFile[] = []
  while (results.length < maxFiles) {
    let added = false
    for (const prefix of prefixes) {
      if (results.length >= maxFiles) break
      const offset = offsets.get(prefix) ?? 0
      const candidate = candidatesByPrefix.get(prefix)?.[offset]
      if (!candidate) continue
      results.push(candidate)
      offsets.set(prefix, offset + 1)
      added = true
    }
    if (!added) break
  }
  const eligibleFiles = [...eligibleCountsByPrefix.values()].reduce(
    (sum, count) => sum + count,
    0,
  )
  const skippedFiles = Math.max(0, eligibleFiles - results.length)
  const skippedPrefixes = prefixes.filter(
    (prefix) =>
      (eligibleCountsByPrefix.get(prefix) ?? 0) > (offsets.get(prefix) ?? 0),
  )
  return {
    files: results,
    truncated: skippedFiles > 0,
    maxFiles,
    skippedFiles,
    skippedPrefixes,
  }
}

function loadIgnorePatterns(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  } catch {
    return []
  }
}

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}
