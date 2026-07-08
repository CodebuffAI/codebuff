import * as fs from 'node:fs'
import * as path from 'node:path'

import ignore from 'ignore'

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
  'tmp',
  '.tmp',
  'out',
])

const MAX_FILE_SIZE = 500_000 // 500KB
const MAX_FILES = 20_000

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
  '.uasset', '.umap', '.assets',
  '.fbx', '.obj', '.dae', '.3ds', '.blend',

  // Image / texture formats
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif',
  '.webp', '.ico', '.svg', '.dds', '.tga', '.psd', '.exr', '.hdr',

  // Audio formats
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus',

  // Video formats
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv',

  // 3D / animation binary formats
  '.anim', '.controller', '.mat', '.cub', '.physicmaterial',

  // Compiled / packaged formats
  '.class', '.jar', '.war', '.dll', '.lib', '.exe', '.so', '.dylib',
  '.o', '.a',

  // Compressed archives
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz',
  '.dmg', '.iso', '.pkg', '.deb', '.rpm',

  // Binary containers
  '.pdf', '.docx', '.xlsx', '.pptx', '.epub', '.sqlite', '.db',
  '.bin', '.dat',
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
  const extraExcludeSet = new Set(extraExclude)
  const matcher = ignore()
    .add(loadIgnorePatterns(path.join(projectRoot, '.gitignore')))
    .add(loadIgnorePatterns(path.join(projectRoot, '.codebuffignore')))
    .add(extraExclude)

  const results: WalkedFile[] = []

  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_FILES) return
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) break
      const abs = path.join(dir, entry.name)
      const rel = path.relative(projectRoot, abs)

      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDE_DIRS.has(entry.name) || extraExcludeSet.has(entry.name)) {
          continue
        }
        if (matcher.ignores(`${normalizeRelativePath(rel)}/`)) continue
        await walk(abs)
      } else if (entry.isFile()) {
        if (matcher.ignores(normalizeRelativePath(rel))) continue
        let stat: fs.Stats
        try {
          stat = await fs.promises.stat(abs)
        } catch {
          continue
        }
        if (stat.size > MAX_FILE_SIZE) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (BINARY_EXTENSIONS.has(ext)) continue
        results.push({
          absolutePath: abs,
          relativePath: rel,
          ext,
          mtime: stat.mtimeMs,
          size: stat.size,
        })
      }
    }
  }

  await walk(projectRoot)
  return results
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

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}
