/**
 * Asset reference extraction for game engine files.
 *
 * Parses lightweight text references from game engine asset files WITHOUT
 * reading binary payloads. Each engine format has its own extraction strategy
 * based on the text representation of asset references:
 *
 * - Unity `.meta` files: YAML containing a `guid:` field. The GUID identifies
 *   the asset; other `.meta` files and `.prefab`/`.unity` files reference it.
 * - Unity `.prefab`/`.unity` (text serialization): YAML containing
 *   `{fileID: N, guid: GUID}` references to other assets.
 * - Godot `.tscn`/`.tres`: text files with `[ext_resource ... path="res://..."]`
 *   lines referencing other resources.
 * - Unreal `.uproject` (JSON text): references to plugins and modules.
 * - Bevy: `assets/` directory files (TOML/RON/JSON) referencing asset paths.
 *
 * Binary formats (`.uasset`, `.umap`, `.fbx`, etc.) are skipped entirely by
 * the file-walker's `BINARY_EXTENSIONS` set and never reach this module.
 *
 * The output `AssetRef[]` is stored on `IndexedFile.assetRefs` and consumed by
 * `buildGraph` to create `references` edges in the codebase graph.
 */

/** A single asset reference extracted from a game engine file. */
export interface AssetRef {
  /** The raw reference string as it appears in the file (GUID, res:// path, etc.). */
  rawRef: string
  /**
   * The reference type:
   * - `guid` — a Unity GUID string (32 hex chars)
   * - `res_path` — a Godot `res://` resource path
   * - `asset_path` — a relative file path (Bevy, Unreal)
   * - `file_id` — a Unity fileID (local reference within a file)
   */
  refType: 'guid' | 'res_path' | 'asset_path' | 'file_id'
  /**
   * Resolved project-relative path if the reference could be mapped to a
   * concrete file in the index. Null for unresolved refs (e.g. a GUID with no
   * matching `.meta` file, or a `res://` path that doesn't exist).
   */
  resolvedPath: string | null
}

/** Maximum number of asset refs extracted per file, to bound index growth. */
const MAX_ASSET_REFS_PER_FILE = 80

// ---------------------------------------------------------------------------
// Unity
// ---------------------------------------------------------------------------

/**
 * Unity GUID regex source: 32 hex characters (case-insensitive). Unity GUIDs are
 * always 32-char hex strings in `.meta` files and serialized YAML assets.
 * Stored as a source string (not a /g regex) to avoid stateful `lastIndex`
 * bugs across calls — we create a fresh `new RegExp(..., 'g')` each time.
 */
const UNITY_GUID_REGEX_SOURCE = 'guid:\\s*([0-9a-fA-F]{32})'

/**
 * Unity fileID regex source: integer or hex value. In serialized YAML,
 * references look like `{fileID: 12345}` or `{fileID: -67890}`. We capture the
 * numeric value including sign.
 */
const UNITY_FILEID_REGEX_SOURCE = 'fileID:\\s*(-?\\d+)'

/**
 * Extract Unity asset references from a `.meta`, `.prefab`, or `.unity` file.
 *
 * `.meta` files contain a `guid:` field that IDENTIFIES the asset — we extract
 * it as a `guid` ref with `resolvedPath` set to the `.meta` file's own path
 * (the GUID belongs to this file). Other files referencing this GUID will
 * resolve via the GUID → path map built in `buildGraph`.
 *
 * `.prefab` and `.unity` (text serialization) contain `guid:` references to
 * OTHER assets plus `fileID:` local references. We extract external GUIDs as
 * `guid` refs (the referencing file) and fileIDs as `file_id` refs (always
 * unresolved — they're intra-file references, not cross-file).
 *
 * @param content - The UTF-8 text content of the file.
 * @param isMetaFile - True if this is a `.meta` file (GUID is self-identifying).
 * @param selfPath - The project-relative path of this file (for `.meta` GUID mapping).
 */
export function extractUnityRefs(
  content: string,
  isMetaFile: boolean,
  selfPath?: string,
): AssetRef[] {
  const refs: AssetRef[] = []
  const seen = new Set<string>()

  if (isMetaFile) {
    // .meta files: the guid field identifies THIS asset. Extract it once
    // and set resolvedPath to the .meta file's own path (stripping .meta
    // to point at the actual asset).
    const guidRegex = new RegExp(UNITY_GUID_REGEX_SOURCE, 'g')
    const match = guidRegex.exec(content)
    if (match) {
      const guid = match[1].toLowerCase()
      const assetPath = selfPath
        ? selfPath.replace(/\.meta$/, '')
        : selfPath
      refs.push({
        rawRef: guid,
        refType: 'guid',
        resolvedPath: assetPath ?? null,
      })
      seen.add(`guid:${guid}`)
    }
    return refs.slice(0, MAX_ASSET_REFS_PER_FILE)
  }

  // .prefab / .unity: extract external guid references.
  let m: RegExpExecArray | null
  const guidRegex = new RegExp(UNITY_GUID_REGEX_SOURCE, 'g')
  while ((m = guidRegex.exec(content)) !== null && refs.length < MAX_ASSET_REFS_PER_FILE) {
    const guid = m[1].toLowerCase()
    const key = `guid:${guid}`
    if (!seen.has(key)) {
      seen.add(key)
      refs.push({
        rawRef: guid,
        refType: 'guid',
        resolvedPath: null, // resolved later via GUID → path map in buildGraph
      })
    }
  }

  // Also extract fileID references (local, always unresolved).
  const fileIdRegex = new RegExp(UNITY_FILEID_REGEX_SOURCE, 'g')
  while ((m = fileIdRegex.exec(content)) !== null && refs.length < MAX_ASSET_REFS_PER_FILE) {
    const fileId = m[1]
    const key = `file_id:${fileId}`
    if (!seen.has(key)) {
      seen.add(key)
      refs.push({
        rawRef: fileId,
        refType: 'file_id',
        resolvedPath: null,
      })
    }
  }

  return refs
}

// ---------------------------------------------------------------------------
// Godot
// ---------------------------------------------------------------------------

/**
 * Godot ext_resource regex. In `.tscn`/`.tres` files, external resources are
 * declared as:
 *   [ext_resource path="res://textures/player.png" type="Texture2D" id="1_xxxx"]
 * We extract the `res://` path, stripping the protocol to get a project-
 * relative path.
 */
const GODOT_EXT_RESOURCE_REGEX_SOURCE = '\\[ext_resource[^\\]]*path="res:\\/\\/([^"]+)"'

/**
 * Godot preload()/load() regex source. GDScript code references resources via:
 *   var tex = preload("res://textures/player.png")
 *   var snd = load("res://sounds/jump.wav")
 * We extract the `res://` path from both calls.
 */
const GODOT_PRELOAD_REGEX_SOURCE = '(?:preload|load)\\(\\s*"res:\\/\\/([^"]+)"'

/**
 * Extract Godot asset references from a `.tscn` or `.tres` file.
 *
 * Godot resource paths use the `res://` protocol (project root). We strip the
 * `res://` prefix to get a project-relative path and attempt direct resolution.
 *
 * @param content - The UTF-8 text content of the `.tscn`/`.tres` file.
 */
export function extractGodotRefs(content: string): AssetRef[] {
  const refs: AssetRef[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  const regex = new RegExp(GODOT_EXT_RESOURCE_REGEX_SOURCE, 'g')
  while ((m = regex.exec(content)) !== null && refs.length < MAX_ASSET_REFS_PER_FILE) {
    const resPath = m[1]
    const key = `res:${resPath}`
    if (!seen.has(key)) {
      seen.add(key)
      refs.push({
        rawRef: `res://${resPath}`,
        refType: 'res_path',
        resolvedPath: resPath, // res:// is project-relative; resolvedPath is the path as-is
      })
    }
  }

  return refs
}

/**
 * Extract Godot resource references from a `.gd` (GDScript) file.
 *
 * GDScript code references external resources via `preload("res://...")` and
 * `load("res://...")` calls. These are code-level asset references that create
 * script→asset graph edges. We strip `res://` to get a project-relative path.
 *
 * @param content - The UTF-8 text content of the `.gd` file.
 */
export function extractGodotScriptRefs(content: string): AssetRef[] {
  const refs: AssetRef[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  const regex = new RegExp(GODOT_PRELOAD_REGEX_SOURCE, 'g')
  while ((m = regex.exec(content)) !== null && refs.length < MAX_ASSET_REFS_PER_FILE) {
    const resPath = m[1]
    const key = `res:${resPath}`
    if (!seen.has(key)) {
      seen.add(key)
      refs.push({
        rawRef: `res://${resPath}`,
        refType: 'res_path',
        resolvedPath: resPath,
      })
    }
  }

  return refs
}

// ---------------------------------------------------------------------------
// Unreal
// ---------------------------------------------------------------------------

/**
 * Extract Unreal references from a `.uproject` file (JSON text).
 *
 * `.uproject` files are JSON containing `Plugins` and `Modules` arrays. Each
 * plugin/module name is a reference to a directory under `Plugins/` or
 * `Source/`. We extract these as `asset_path` refs pointing to the likely
 * directory.
 *
 * Binary Unreal files (`.uasset`, `.umap`) are skipped by BINARY_EXTENSIONS
 * and never reach here.
 *
 * @param content - The UTF-8 text content of the `.uproject` file.
 */
export function extractUnrealRefs(content: string): AssetRef[] {
  const refs: AssetRef[] = []
  const seen = new Set<string>()

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return refs
  }

  if (!parsed || typeof parsed !== 'object') return refs
  const project = parsed as Record<string, unknown>

  // Modules array: each has a "Name" field pointing to Source/<Name>.
  const modules = project.Modules
  if (Array.isArray(modules)) {
    for (const mod of modules) {
      if (typeof mod === 'object' && mod !== null && 'Name' in mod) {
        const name = String((mod as Record<string, unknown>).Name)
        if (name && !seen.has(`mod:${name}`)) {
          seen.add(`mod:${name}`)
          refs.push({
            rawRef: name,
            refType: 'asset_path',
            resolvedPath: `Source/${name}`,
          })
        }
      }
    }
  }

  // Plugins array: each has a "Name" field pointing to Plugins/<Name>.
  const plugins = project.Plugins
  if (Array.isArray(plugins)) {
    for (const plugin of plugins) {
      if (typeof plugin === 'object' && plugin !== null && 'Name' in plugin) {
        const name = String((plugin as Record<string, unknown>).Name)
        if (name && !seen.has(`plug:${name}`)) {
          seen.add(`plug:${name}`)
          refs.push({
            rawRef: name,
            refType: 'asset_path',
            resolvedPath: `Plugins/${name}`,
          })
        }
      }
    }
  }

  return refs.slice(0, MAX_ASSET_REFS_PER_FILE)
}

// ---------------------------------------------------------------------------
// Bevy
// ---------------------------------------------------------------------------

/**
 * Extract Bevy asset references from config files.
 *
 * Bevy asset loading typically uses RON, TOML, or JSON files in an `assets/`
 * directory that reference asset file paths. We extract quoted strings that
 * look like relative paths (contain a `/` or end with a known asset extension)
 * as `asset_path` refs.
 *
 * This is a conservative heuristic: we only extract strings that look like
 * file paths (contain `/` and/or have a known extension) to avoid noise from
 * arbitrary string values.
 */
const BEVY_ASSET_PATH_REGEX = /["']([a-zA-Z0-9_\-./]+\.(?:png|jpg|jpeg|gif|bmp|svg|wav|mp3|ogg|flac|fbx|obj|gltf|glb|ron|toml))["']/gi

/**
 * Known Bevy asset file extensions for path detection.
 */
const BEVY_ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg',
  '.wav', '.mp3', '.ogg', '.flac',
  '.fbx', '.obj', '.gltf', '.glb',
  '.ron', '.toml',
])

export function extractBevyRefs(content: string): AssetRef[] {
  const refs: AssetRef[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  const regex = new RegExp(BEVY_ASSET_PATH_REGEX.source, 'gi')
  while ((m = regex.exec(content)) !== null && refs.length < MAX_ASSET_REFS_PER_FILE) {
    const assetPath = m[1]
    const key = `bevy:${assetPath}`
    if (!seen.has(key) && !assetPath.startsWith('http')) {
      seen.add(key)
      // Determine if this is likely a relative asset path.
      const ext = assetPath.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]
      if (ext && BEVY_ASSET_EXTENSIONS.has(ext)) {
        refs.push({
          rawRef: assetPath,
          refType: 'asset_path',
          resolvedPath: `assets/${assetPath}`,
        })
      }
    }
  }

  return refs
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Unity text asset extensions that the file-walker does NOT skip as binary.
 * `.meta`, `.prefab`, and `.unity` are text (YAML) in Unity's text serialization
 * mode and can be parsed for references.
 */
const UNITY_TEXT_ASSET_EXTENSIONS = new Set(['.meta', '.prefab', '.unity'])

/** Godot text resource extensions. */
const GODOT_TEXT_ASSET_EXTENSIONS = new Set(['.tscn', '.tres', '.gd'])

/** Unreal text asset extensions (binary formats like .uasset are in BINARY_EXTENSIONS). */
const UNREAL_TEXT_ASSET_EXTENSIONS = new Set(['.uproject'])

/** Bevy asset config extensions. */
const BEVY_ASSET_CONFIG_EXTENSIONS = new Set(['.ron', '.toml'])

/**
 * Extract asset references from a game engine file based on its extension.
 *
 * Returns an empty array for non-asset files or unsupported formats. The
 * function is purely text-based — it never reads binary payloads.
 *
 * @param content - The UTF-8 text content of the file.
 * @param ext - The lowercase file extension (e.g. '.meta', '.tscn').
 * @param filePath - The project-relative file path (for `.meta` GUID self-identification).
 */
export function extractAssetRefs(
  content: string,
  ext: string,
  filePath: string,
): AssetRef[] {
  if (UNITY_TEXT_ASSET_EXTENSIONS.has(ext)) {
    return extractUnityRefs(content, ext === '.meta', filePath)
  }

  if (GODOT_TEXT_ASSET_EXTENSIONS.has(ext)) {
    if (ext === '.tscn' || ext === '.tres') {
      return extractGodotRefs(content)
    }
    // .gd (GDScript) files: extract preload()/load() resource references.
    if (ext === '.gd') {
      return extractGodotScriptRefs(content)
    }
    return []
  }

  if (UNREAL_TEXT_ASSET_EXTENSIONS.has(ext)) {
    return extractUnrealRefs(content)
  }

  // Bevy: only extract from config files in assets/ dir, not all .ron/.toml.
  // We check the path heuristically — if it's in an assets/ directory.
  if (BEVY_ASSET_CONFIG_EXTENSIONS.has(ext) && filePath.includes('assets/')) {
    return extractBevyRefs(content)
  }

  return []
}

/**
 * Build a GUID → file path map from all indexed `.meta` files.
 *
 * This map is used by `buildGraph` to resolve Unity `guid` references to
 * actual file paths. Each `.meta` file produces one entry: `guid → assetPath`
 * (the path without the `.meta` suffix).
 *
 * @param files - The full set of indexed files.
 * @returns Map from lowercase GUID → project-relative asset path.
 */
export function buildGuidToPathMap(
  files: Record<string, { ext: string; assetRefs?: AssetRef[] }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const [filePath, file] of Object.entries(files)) {
    if (file.ext !== '.meta' || !file.assetRefs) continue
    for (const ref of file.assetRefs) {
      if (ref.refType === 'guid' && ref.resolvedPath) {
        map.set(ref.rawRef, ref.resolvedPath)
      }
    }
  }
  return map
}

/**
 * Resolve a GUID reference to a file path using the GUID → path map.
 *
 * @param guid - The lowercase Unity GUID string.
 * @param guidMap - The GUID → path map built by `buildGuidToPathMap`.
 * @returns The resolved project-relative path, or null if not found.
 */
export function resolveGuidRef(
  guid: string,
  guidMap: Map<string, string>,
): string | null {
  return guidMap.get(guid) ?? null
}
