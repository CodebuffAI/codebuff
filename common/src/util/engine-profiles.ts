import type { FileTreeNode } from './file'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportedEngineId =
  | 'unity'
  | 'godot'
  | 'unreal'
  | 'bevy'

export type EngineProfile = {
  id: SupportedEngineId
  displayName: string
  /** Short guidance injected into the system prompt for game-dev repos. */
  guidance: string
}

// ---------------------------------------------------------------------------
// Engine profile definitions
// ---------------------------------------------------------------------------

const ENGINE_PROFILES: Record<SupportedEngineId, EngineProfile> = {
  unity: {
    id: 'unity',
    displayName: 'Unity',
    guidance:
      'Treat Unity assets (scenes, prefabs, ScriptableObjects) as first-class project files. ' +
      'GUID references in .meta files link assets; preserve them when moving or renaming. ' +
      'Avoid reading large binary assets (.png, .fbx, .prefab binary sections) as text — use path/metadata instead.',
  },
  godot: {
    id: 'godot',
    displayName: 'Godot',
    guidance:
      'Godot 4 uses .tscn/.tres text scenes and resources with ExtResource/SubResource references. ' +
      'GDScript (.gd) is the primary language; respect scene tree hierarchy and node naming conventions. ' +
      'Avoid deep-parsing binary .scn/.res files — prefer text-format equivalents or metadata.',
  },
  unreal: {
    id: 'unreal',
    displayName: 'Unreal Engine',
    guidance:
      'Unreal Engine 5 projects use .uasset/.umap binary packages and C++ source in Source/. ' +
      'Blueprint assets are binary — do not read as text. Config/ contains .ini settings. ' +
      'Respect module structure in .uproject and Build.cs files.',
  },
  bevy: {
    id: 'bevy',
    displayName: 'Bevy',
    guidance:
      'Bevy is a Rust ECS game engine. Check Cargo.toml for bevy dependency. ' +
      'Assets/ directory holds game resources; .rs files use Bevy ECS patterns (Systems, Components, Resources, Plugins). ' +
      'Respect Rust ownership/borrowing and Bevy schedule conventions.',
  },
}

const ENGINE_ORDER: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']

// Manifest files/paths that uniquely identify each engine.
// These are checked by exact path match (for specific files like
// 'ProjectSettings/ProjectVersion.txt' or 'project.godot') or by extension
// suffix (for '.uproject' which is a file extension, not a path).
const ENGINE_MANIFEST_PATHS: Record<SupportedEngineId, string[]> = {
  unity: ['ProjectSettings/ProjectVersion.txt'],
  godot: ['project.godot'],
  unreal: [], // .uproject is an extension, handled in ENGINE_EXTENSIONS
  // Bevy has no single manifest file; detected via Cargo.toml + bevy dep + assets/
  bevy: [],
}

const ENGINE_EXTENSIONS: Record<SupportedEngineId, string[]> = {
  unity: ['.unity', '.prefab', '.asmdef'],
  godot: ['.tscn', '.tres', '.gd'],
  unreal: ['.uproject', '.uasset', '.umap'],
  // Bevy shares .rs with general Rust; detection needs Cargo.toml bevy dep
  bevy: [],
}

// Directory patterns that signal engine presence (checked as path prefixes)
const ENGINE_DIRECTORY_PATTERNS: Record<SupportedEngineId, string[]> = {
  unity: ['Assets/', 'ProjectSettings/'],
  godot: ['addons/'],
  unreal: ['Content/', 'Config/'],
  bevy: ['assets/'],
}

// ---------------------------------------------------------------------------
// Detection logic
// ---------------------------------------------------------------------------

function getFileExtension(name: string): string {
  const index = name.lastIndexOf('.')
  if (index <= 0) return ''
  return name.slice(index).toLowerCase()
}

function normalizePath(filePath: string): string {
  // Normalize to forward slashes and strip leading ./
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

function pathStartsWith(filePath: string, prefix: string): boolean {
  const normalized = normalizePath(filePath)
  // Strip trailing slash from prefix so patterns like 'Assets/' match
  // 'Assets/readme.md' (without doubling the slash).
  const normalizedPrefix = normalizePath(prefix).replace(/\/$/, '')
  return (
    normalized === normalizedPrefix ||
    normalized.startsWith(normalizedPrefix + '/')
  )
}

/**
 * Collect file paths from a file tree, flattening directories.
 * Returns an array of normalized file paths.
 */
function collectFilePaths(
  nodes: FileTreeNode[],
  paths: string[] = [],
): string[] {
  for (const node of nodes) {
    if (node.type === 'directory') {
      collectFilePaths(node.children ?? [], paths)
      continue
    }
    paths.push(node.filePath || node.name)
  }
  return paths
}

/**
 * Detect whether a Bevy project is present by checking if Cargo.toml exists
 * and contains a "bevy" dependency. This requires the file content, which
 * we don't have from the file tree alone — so we use a heuristic: if the
 * repo has both a Cargo.toml (Rust) and an assets/ directory, flag it as
 * potential Bevy. The caller can refine with actual file content if needed.
 *
 * For now, we check: Cargo.toml present + assets/ directory present.
 * This is conservative and may produce false negatives for Bevy projects
 * that use a different assets path.
 */
function detectBevyHeuristic(filePaths: string[]): boolean {
  const hasCargoToml = filePaths.some(
    (p) => normalizePath(p) === 'Cargo.toml',
  )
  const hasAssetsDir = filePaths.some((p) =>
    pathStartsWith(p, 'assets/'),
  )
  return hasCargoToml && hasAssetsDir
}

/**
 * Detect game engine profiles from a file tree.
 *
 * Detection signals per engine:
 * - Unity: ProjectSettings/ProjectVersion.txt, .unity/.prefab/.asmdef files,
 *   Assets/ or ProjectSettings/ directories
 * - Godot: project.godot manifest, .tscn/.tres/.gd files, addons/ directory
 * - Unreal: .uproject manifest, .uasset/.umap files, Content/ or Config/
 *   directories
 * - Bevy: Cargo.toml + assets/ directory heuristic (no unique manifest)
 *
 * .meta and .csproj files are Unity signals but also matched by the C#
 * language profile; they are secondary signals for Unity and only count
 * when combined with other Unity signals. .csproj/.rs are NOT used as
 * standalone engine signals to avoid false positives on non-game C#/Rust
 * projects.
 */
export function detectEngineProfiles(
  fileTree: FileTreeNode[],
): EngineProfile[] {
  const detected = new Set<SupportedEngineId>()
  const filePaths = collectFilePaths(fileTree)

  for (const engineId of ENGINE_ORDER) {
    const manifestPaths = ENGINE_MANIFEST_PATHS[engineId]
    const extensions = ENGINE_EXTENSIONS[engineId]
    const dirPatterns = ENGINE_DIRECTORY_PATTERNS[engineId]

    // Check manifest files (exact path match)
    for (const manifest of manifestPaths) {
      const normalizedManifest = normalizePath(manifest)
      if (
        filePaths.some(
          (p) => normalizePath(p) === normalizedManifest,
        )
      ) {
        detected.add(engineId)
        break
      }
    }

    if (detected.has(engineId)) continue

    // Check file extensions (strong signals for Unity/Godot/Unreal)
    if (extensions.length > 0) {
      const hasExtension = filePaths.some((p) => {
        const ext = getFileExtension(p)
        return extensions.includes(ext)
      })
      if (hasExtension) {
        // For Unity, .unity/.prefab/.asmdef are strong enough on their own
        if (engineId === 'unity') {
          detected.add(engineId)
          continue
        }
        // For Godot, .tscn/.tres/.gd are strong enough
        if (engineId === 'godot') {
          detected.add(engineId)
          continue
        }
        // For Unreal, .uasset/.umap are strong enough
        if (engineId === 'unreal') {
          detected.add(engineId)
          continue
        }
      }
    }

    if (detected.has(engineId)) continue

    // Check directory patterns (weaker signal — needs at least 2 matches
    // or a manifest to avoid false positives from generic dir names)
    if (dirPatterns.length > 0) {
      const matchCount = dirPatterns.filter((pattern) =>
        filePaths.some((p) => pathStartsWith(p, pattern)),
      ).length

      // Directory patterns alone: need at least the manifest or 1+ dir match
      // for engines with unique dirs, but be conservative for generic dirs
      // like "assets/" which could appear in non-game projects.
      if (engineId === 'unreal' && matchCount >= 1) {
        // Content/ or Config/ are fairly unique to Unreal
        detected.add(engineId)
      } else if (engineId === 'unity' && matchCount >= 1) {
        // Assets/ or ProjectSettings/ are strong Unity signals
        detected.add(engineId)
      } else if (engineId === 'godot' && matchCount >= 1) {
        // addons/ is a decent Godot signal
        detected.add(engineId)
      }
      // Bevy: handled separately below
    }
  }

  // Bevy detection: needs Cargo.toml + assets/ (heuristic)
  if (!detected.has('bevy')) {
    if (detectBevyHeuristic(filePaths)) {
      detected.add('bevy')
    }
  }

  return ENGINE_ORDER.filter((id) => detected.has(id)).map(
    (id) => ENGINE_PROFILES[id],
  )
}

/**
 * Format engine profile guidance for injection into the system prompt.
 * Returns an empty string if no engine is detected.
 */
export function formatEngineProfilePrompt(params: {
  profiles: EngineProfile[]
}): string {
  const { profiles } = params
  if (profiles.length === 0) return ''

  const engines = profiles.map((profile) => profile.displayName).join(', ')
  const rows = profiles
    .map((profile) => `- ${profile.displayName}: ${profile.guidance}`)
    .join('\n')

  return `## Engine profile\n\nDetected: ${engines}. This appears to be a game-engine project. Follow engine-specific conventions for assets, scenes, and build workflows.\n\n${rows}\n`
}

/**
 * Convenience: detect engine profiles from a file tree and format the prompt
 * in one call, mirroring `formatLanguageProfilePromptForFileTree`.
 */
export function formatEngineProfilePromptForFileTree(
  fileTree: FileTreeNode[],
): string {
  return formatEngineProfilePrompt({
    profiles: detectEngineProfiles(fileTree),
  })
}
