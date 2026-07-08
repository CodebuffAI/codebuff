import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  buildGuidToPathMap,
  extractAssetRefs,
  extractBevyRefs,
  extractGodotRefs,
  extractGodotScriptRefs,
  extractUnityRefs,
  extractUnrealRefs,
  resolveGuidRef,
} from './asset-refs'
import { buildMetadataIndex } from './metadata-indexer'
import { queryIndex } from './query'

// ---------------------------------------------------------------------------
// Unity .meta extraction
// ---------------------------------------------------------------------------

describe('asset-refs: Unity .meta', () => {
  const SAMPLE_META = `fileFormatVersion: 2
guid: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
TextureImporter:
  internalIDToNameTable: []
  userData: 
  assetBundleName: 
`

  test('extracts self-identifying GUID from .meta file', () => {
    const refs = extractUnityRefs(SAMPLE_META, true, 'Assets/Textures/player.png.meta')
    expect(refs).toHaveLength(1)
    expect(refs[0].refType).toBe('guid')
    expect(refs[0].rawRef).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')
    expect(refs[0].resolvedPath).toBe('Assets/Textures/player.png')
  })

  test('returns empty for .meta with no guid', () => {
    const content = `fileFormatVersion: 2
TextureImporter: {}
`
    const refs = extractUnityRefs(content, true, 'Assets/foo.meta')
    expect(refs).toHaveLength(0)
  })

  test('resolvedPath strips .meta suffix', () => {
    const refs = extractUnityRefs(SAMPLE_META, true, 'Assets/Prefabs/Enemy.prefab.meta')
    expect(refs[0].resolvedPath).toBe('Assets/Prefabs/Enemy.prefab')
  })
})

// ---------------------------------------------------------------------------
// Unity .prefab / .unity extraction
// ---------------------------------------------------------------------------

describe('asset-refs: Unity .prefab/.unity', () => {
  const SAMPLE_PREFAB = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1001 &1234567890
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Modification:
    m_TransformParent: {fileID: -1234567890}
    m_Modifications:
    - target: {fileID: 100000, guid: abcdef0123456789abcdef0123456789, type: 3}
      propertyPath: m_Name
      value: Player
    - target: {fileID: 200000, guid: 11112222333344445555666677778888, type: 3}
      propertyPath: m_LocalPosition.x
      value: 0
`

  test('extracts external guid references from .prefab', () => {
    const refs = extractUnityRefs(SAMPLE_PREFAB, false, 'Assets/Prefabs/Player.prefab')
    const guidRefs = refs.filter((r) => r.refType === 'guid')
    expect(guidRefs).toHaveLength(2)
    expect(guidRefs[0].rawRef).toBe('abcdef0123456789abcdef0123456789')
    expect(guidRefs[1].rawRef).toBe('11112222333344445555666677778888')
    // External guid refs are unresolved at extraction time (resolved later via GUID map)
    expect(guidRefs[0].resolvedPath).toBeNull()
    expect(guidRefs[1].resolvedPath).toBeNull()
  })

  test('extracts fileID references', () => {
    const refs = extractUnityRefs(SAMPLE_PREFAB, false, 'Assets/Prefabs/Player.prefab')
    const fileIdRefs = refs.filter((r) => r.refType === 'file_id')
    expect(fileIdRefs.length).toBeGreaterThan(0)
    expect(fileIdRefs[0].resolvedPath).toBeNull()
  })

  test('deduplicates repeated guid references', () => {
    const content = `%YAML 1.1
- {fileID: 0, guid: abcdef0123456789abcdef0123456789}
- {fileID: 1, guid: abcdef0123456789abcdef0123456789}
- {fileID: 2, guid: abcdef0123456789abcdef0123456789}
`
    const refs = extractUnityRefs(content, false, 'Assets/test.prefab')
    const guidRefs = refs.filter((r) => r.refType === 'guid')
    expect(guidRefs).toHaveLength(1)
  })

  test('returns empty for non-asset content', () => {
    const refs = extractUnityRefs('hello world', false, 'Assets/test.prefab')
    expect(refs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Godot .tscn / .tres extraction
// ---------------------------------------------------------------------------

describe('asset-refs: Godot .tscn/.tres', () => {
  const SAMPLE_TSCN = `[gd_scene load_steps=3 format=3 uid="uid://abcdef"]

[ext_resource type="Texture2D" uid="uid://xyz123" path="res://textures/player.png" id="1_abc"]
[ext_resource type="Script" path="res://scripts/player_controller.gd" id="2_def"]
[ext_resource type="Material" path="res://materials/player_material.tres" id="3_ghi"]

[node name="Player" type="Sprite2D"]
texture = ExtResource("1_abc")
`

  test('extracts res:// paths from ext_resource lines', () => {
    const refs = extractGodotRefs(SAMPLE_TSCN)
    expect(refs).toHaveLength(3)
    expect(refs[0].refType).toBe('res_path')
    expect(refs[0].rawRef).toBe('res://textures/player.png')
    expect(refs[0].resolvedPath).toBe('textures/player.png')
    expect(refs[1].rawRef).toBe('res://scripts/player_controller.gd')
    expect(refs[2].rawRef).toBe('res://materials/player_material.tres')
  })

  test('resolvedPath strips res:// prefix for project-relative path', () => {
    const refs = extractGodotRefs(SAMPLE_TSCN)
    for (const ref of refs) {
      expect(ref.resolvedPath).not.toContain('res://')
    }
  })

  test('deduplicates repeated res:// paths', () => {
    const content = `[ext_resource path="res://textures/player.png" id="1"]
[ext_resource path="res://textures/player.png" id="2"]
`
    const refs = extractGodotRefs(content)
    expect(refs).toHaveLength(1)
  })

  test('returns empty for non-Godot content', () => {
    const refs = extractGodotRefs('hello world')
    expect(refs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Godot .gd (GDScript) preload/load extraction
// ---------------------------------------------------------------------------

describe('asset-refs: Godot .gd preload/load', () => {
  const SAMPLE_GD = `extends Node2D

const TEX = preload("res://textures/player.png")
const SND = load("res://sounds/jump.wav")
var scene = preload("res://scenes/maze.tscn")

func _ready():
    var icon = load("res://icons/sword.png")
    pass
`

  test('extracts preload() res:// paths from .gd files', () => {
    const refs = extractGodotScriptRefs(SAMPLE_GD)
    expect(refs.length).toBeGreaterThanOrEqual(3)
    expect(refs.some((r) => r.rawRef === 'res://textures/player.png')).toBe(true)
    expect(refs.some((r) => r.rawRef === 'res://scenes/maze.tscn')).toBe(true)
  })

  test('extracts load() res:// paths from .gd files', () => {
    const refs = extractGodotScriptRefs(SAMPLE_GD)
    expect(refs.some((r) => r.rawRef === 'res://sounds/jump.wav')).toBe(true)
    expect(refs.some((r) => r.rawRef === 'res://icons/sword.png')).toBe(true)
  })

  test('sets resolvedPath without res:// prefix', () => {
    const refs = extractGodotScriptRefs(SAMPLE_GD)
    for (const ref of refs) {
      expect(ref.resolvedPath).not.toContain('res://')
      expect(ref.refType).toBe('res_path')
    }
  })

  test('deduplicates repeated paths', () => {
    const content = `var a = preload("res://tex.png")
var b = preload("res://tex.png")
`
    const refs = extractGodotScriptRefs(content)
    expect(refs).toHaveLength(1)
  })

  test('returns empty for .gd without preload/load calls', () => {
    const refs = extractGodotScriptRefs('extends Node2D\n\nfunc _ready():\n    pass\n')
    expect(refs).toHaveLength(0)
  })

  test('ignores string literals that are not preload/load arguments', () => {
    const content = `var label = "Hello World"
var path = "res://some/path"
`
    // "res://some/path" is in a plain string assignment, NOT in preload()/load()
    const refs = extractGodotScriptRefs(content)
    expect(refs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Unreal .uproject extraction
// ---------------------------------------------------------------------------

describe('asset-refs: Unreal .uproject', () => {
  const SAMPLE_UPROJECT = `{
  "EngineVersion": "5.3.0",
  "Modules": [
    { "Name": "MyGame", "Type": "Runtime" },
    { "Name": "MyGameEditor", "Type": "Editor" }
  ],
  "Plugins": [
    { "Name": "Niagara", "Enabled": true },
    { "Name": "EnhancedInput", "Enabled": true }
  ]
}`

  test('extracts module names as asset_path refs', () => {
    const refs = extractUnrealRefs(SAMPLE_UPROJECT)
    const moduleRefs = refs.filter((r) => r.resolvedPath?.startsWith('Source/'))
    expect(moduleRefs).toHaveLength(2)
    expect(moduleRefs[0].rawRef).toBe('MyGame')
    expect(moduleRefs[0].resolvedPath).toBe('Source/MyGame')
    expect(moduleRefs[1].rawRef).toBe('MyGameEditor')
    expect(moduleRefs[1].resolvedPath).toBe('Source/MyGameEditor')
  })

  test('extracts plugin names as asset_path refs', () => {
    const refs = extractUnrealRefs(SAMPLE_UPROJECT)
    const pluginRefs = refs.filter((r) => r.resolvedPath?.startsWith('Plugins/'))
    expect(pluginRefs).toHaveLength(2)
    expect(pluginRefs[0].rawRef).toBe('Niagara')
    expect(pluginRefs[0].resolvedPath).toBe('Plugins/Niagara')
    expect(pluginRefs[1].rawRef).toBe('EnhancedInput')
  })

  test('returns empty for invalid JSON', () => {
    const refs = extractUnrealRefs('not valid json {{{')
    expect(refs).toHaveLength(0)
  })

  test('returns empty for JSON without Modules/Plugins', () => {
    const refs = extractUnrealRefs('{"EngineVersion": "5.3.0"}')
    expect(refs).toHaveLength(0)
  })

  test('deduplicates module names', () => {
    const content = `{
      "Modules": [
        { "Name": "Game", "Type": "Runtime" },
        { "Name": "Game", "Type": "Editor" }
      ]
    }`
    const refs = extractUnrealRefs(content)
    const moduleRefs = refs.filter((r) => r.resolvedPath?.startsWith('Source/'))
    expect(moduleRefs).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Bevy asset config extraction
// ---------------------------------------------------------------------------

describe('asset-refs: Bevy', () => {
  test('extracts asset paths from RON config', () => {
    const content = `(
      sprites: [
        "textures/player.png",
        "textures/enemy.png",
      ],
      sounds: [
        "audio/jump.wav",
      ],
    )`
    const refs = extractBevyRefs(content)
    expect(refs.length).toBeGreaterThanOrEqual(3)
    expect(refs.some((r) => r.rawRef === 'textures/player.png')).toBe(true)
    expect(refs.some((r) => r.rawRef === 'textures/enemy.png')).toBe(true)
    expect(refs.some((r) => r.rawRef === 'audio/jump.wav')).toBe(true)
  })

  test('sets resolvedPath to assets/<path>', () => {
    const refs = extractBevyRefs('"sprites/hero.png"')
    expect(refs).toHaveLength(1)
    expect(refs[0].resolvedPath).toBe('assets/sprites/hero.png')
  })

  test('ignores non-asset strings', () => {
    const refs = extractBevyRefs('"hello world" "just text"')
    expect(refs).toHaveLength(0)
  })

  test('ignores http URLs', () => {
    const refs = extractBevyRefs('"https://example.com/texture.png"')
    expect(refs).toHaveLength(0)
  })

  test('extracts from TOML-style content', () => {
    const content = `
texture = "sprites/player.png"
model = "models/character.fbx"
`
    const refs = extractBevyRefs(content)
    expect(refs.length).toBeGreaterThanOrEqual(2)
    expect(refs.some((r) => r.rawRef === 'sprites/player.png')).toBe(true)
    expect(refs.some((r) => r.rawRef === 'models/character.fbx')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Dispatch function
// ---------------------------------------------------------------------------

describe('asset-refs: extractAssetRefs dispatch', () => {
  test('dispatches to Unity for .meta', () => {
    const refs = extractAssetRefs(
      'guid: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      '.meta',
      'Assets/Player.meta',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].refType).toBe('guid')
  })

  test('dispatches to Unity for .prefab', () => {
    const refs = extractAssetRefs(
      '{guid: abcdef0123456789abcdef0123456789}',
      '.prefab',
      'Assets/Player.prefab',
    )
    expect(refs.some((r) => r.refType === 'guid')).toBe(true)
  })

  test('dispatches to Godot for .tscn', () => {
    const refs = extractAssetRefs(
      '[ext_resource path="res://player.png" id="1"]',
      '.tscn',
      'Player.tscn',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].refType).toBe('res_path')
  })

  test('dispatches to Godot for .tres', () => {
    const refs = extractAssetRefs(
      '[ext_resource path="res://material.tres" id="1"]',
      '.tres',
      'Player.tres',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].refType).toBe('res_path')
  })

  test('dispatches to Unreal for .uproject', () => {
    const refs = extractAssetRefs(
      '{"Modules": [{"Name": "Game"}]}',
      '.uproject',
      'MyGame.uproject',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].refType).toBe('asset_path')
  })

  test('dispatches to Godot script refs for .gd with preload()', () => {
    const refs = extractAssetRefs(
      'var tex = preload("res://player.png")',
      '.gd',
      'Player.gd',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].refType).toBe('res_path')
    expect(refs[0].rawRef).toBe('res://player.png')
  })

  test('returns empty for .gd without preload/load calls', () => {
    const refs = extractAssetRefs('extends Node', '.gd', 'Player.gd')
    expect(refs).toHaveLength(0)
  })

  test('returns empty for non-asset extensions', () => {
    expect(extractAssetRefs('const x = 1', '.ts', 'src/x.ts')).toHaveLength(0)
    expect(extractAssetRefs('# Title', '.md', 'README.md')).toHaveLength(0)
    expect(extractAssetRefs('{}', '.json', 'package.json')).toHaveLength(0)
  })

  test('returns empty for empty content', () => {
    expect(extractAssetRefs('', '.meta', 'Assets/test.meta')).toHaveLength(0)
    expect(extractAssetRefs('', '.tscn', 'test.tscn')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// GUID map resolution
// ---------------------------------------------------------------------------

describe('asset-refs: GUID map and resolution', () => {
  test('buildGuidToPathMap maps .meta GUIDs to asset paths', () => {
    const files = {
      'Assets/Player.png.meta': {
        ext: '.meta',
        assetRefs: [
          { rawRef: 'aaaabbbbccccddddeeeeffff00001111', refType: 'guid' as const, resolvedPath: 'Assets/Player.png' },
        ],
      },
      'Assets/Enemy.png.meta': {
        ext: '.meta',
        assetRefs: [
          { rawRef: '11112222333344445555666677778888', refType: 'guid' as const, resolvedPath: 'Assets/Enemy.png' },
        ],
      },
      'src/main.ts': { ext: '.ts' },
    }
    const map = buildGuidToPathMap(files)
    expect(map.size).toBe(2)
    expect(map.get('aaaabbbbccccddddeeeeffff00001111')).toBe('Assets/Player.png')
    expect(map.get('11112222333344445555666677778888')).toBe('Assets/Enemy.png')
  })

  test('buildGuidToPathMap skips files without assetRefs', () => {
    const files = {
      'Assets/Player.png.meta': { ext: '.meta' },
      'src/main.ts': { ext: '.ts' },
    }
    const map = buildGuidToPathMap(files)
    expect(map.size).toBe(0)
  })

  test('resolveGuidRef returns mapped path', () => {
    const map = new Map([['abc123', 'Assets/Player.png']])
    expect(resolveGuidRef('abc123', map)).toBe('Assets/Player.png')
  })

  test('resolveGuidRef returns null for unknown GUID', () => {
    const map = new Map([['abc123', 'Assets/Player.png']])
    expect(resolveGuidRef('xyz789', map)).toBeNull()
  })

  test('resolveGuidRef is case-sensitive (GUIDs are lowercased at extraction)', () => {
    const map = new Map([['abcdef0123456789abcdef0123456789', 'Assets/Player.png']])
    expect(resolveGuidRef('abcdef0123456789abcdef0123456789', map)).toBe('Assets/Player.png')
    expect(resolveGuidRef('ABCDEF0123456789ABCDEF0123456789', map)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Integration: buildMetadataIndex with asset refs
// ---------------------------------------------------------------------------

describe('asset-refs: integration with buildMetadataIndex', () => {
  test('Unity .meta file gets assetRefs in index', async () => {
    const root = await makeTempProject({
      'Assets/Textures/player.png.meta': `fileFormatVersion: 2
guid: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
TextureImporter: {}
`,
    })

    const index = await buildMetadataIndex(root)
    const meta = index.files['Assets/Textures/player.png.meta']
    expect(meta).toBeDefined()
    expect(meta?.assetRefs).toBeDefined()
    expect(meta?.assetRefs).toHaveLength(1)
    expect(meta?.assetRefs?.[0].refType).toBe('guid')
    expect(meta?.assetRefs?.[0].rawRef).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')
    expect(meta?.assetRefs?.[0].resolvedPath).toBe('Assets/Textures/player.png')
  })

  test('Unity .prefab gets guid refs and creates references edges via GUID map', async () => {
    const root = await makeTempProject({
      'Assets/Textures/player.png.meta': `fileFormatVersion: 2
guid: abcdef0123456789abcdef0123456789
TextureImporter: {}
`,
      'Assets/Prefabs/Player.prefab': `%YAML 1.1
--- !u!1001 &123
PrefabInstance:
  m_Modifications:
    - target: {fileID: 100, guid: abcdef0123456789abcdef0123456789, type: 3}
      value: Player
`,
    })

    const index = await buildMetadataIndex(root)
    const prefab = index.files['Assets/Prefabs/Player.prefab']
    expect(prefab?.assetRefs).toBeDefined()
    const guidRefs = prefab?.assetRefs?.filter((r) => r.refType === 'guid')
    expect(guidRefs).toHaveLength(1)
    expect(guidRefs?.[0].rawRef).toBe('abcdef0123456789abcdef0123456789')

    // The prefab should have a references edge to the .meta's asset (player.png).
    // The edge goes from the prefab to the .meta file's resolved path.
    const refEdges = index.graph.edges.filter(
      (e) =>
        e.type === 'references' &&
        e.from === 'file:Assets/Prefabs/Player.prefab',
    )
    // The GUID reference should resolve to the .meta file (the asset path).
    expect(refEdges.some((e) => e.to.includes('Assets/Textures/player.png'))).toBe(true)
  })

  test('Godot .tscn gets res:// refs and creates references edges', async () => {
    const root = await makeTempProject({
      'textures/player.png': '\x89PNG fake binary',
      'scripts/player.gd': 'extends Node2D\n',
      'scenes/player.tscn': `[gd_scene load_steps=2 format=3]

[ext_resource type="Texture2D" path="res://textures/player.png" id="1"]
[ext_resource type="Script" path="res://scripts/player.gd" id="2"]

[node name="Player" type="Sprite2D"]
`,
    })

    const index = await buildMetadataIndex(root)
    const tscn = index.files['scenes/player.tscn']
    expect(tscn?.assetRefs).toBeDefined()
    expect(tscn?.assetRefs).toHaveLength(2)

    // The .tscn should have references edges to the referenced files.
    // Note: player.png is a .png so it's in BINARY_EXTENSIONS and will NOT
    // be in the index (skipped by file-walker). player.gd IS indexed.
    const tscnRefEdges = index.graph.edges.filter(
      (e) =>
        e.type === 'references' &&
        e.from === 'file:scenes/player.tscn',
    )
    // player.gd is a text file and should be indexed → reference edge.
    expect(
      tscnRefEdges.some((e) => e.to === 'file:scripts/player.gd'),
    ).toBe(true)
  })

  test('Unreal .uproject gets module/plugin refs', async () => {
    const root = await makeTempProject({
      'MyGame.uproject': `{
        "Modules": [{"Name": "MyGame", "Type": "Runtime"}],
        "Plugins": [{"Name": "Niagara", "Enabled": true}]
      }`,
      'Source/MyGame/MyGame.Build.cs': 'using UnrealBuildTool;\n',
    })

    const index = await buildMetadataIndex(root)
    const uproject = index.files['MyGame.uproject']
    expect(uproject?.assetRefs).toBeDefined()
    const modRef = uproject?.assetRefs?.find((r) => r.rawRef === 'MyGame')
    expect(modRef).toBeDefined()
    expect(modRef?.resolvedPath).toBe('Source/MyGame')

    // Source/MyGame/MyGame.Build.cs is indexed, but the ref path is
    // Source/MyGame (a directory, not a file), so no file→file edge is created
    // unless there's a file at exactly that path.
    // The reference edge requires files[resolvedPath] to exist.
    // Source/MyGame is a directory, not a file, so no edge here.
    // This is correct behavior — directory-level references are informational.
  })

  test('Godot .gd preload refs create references edges to indexed resources', async () => {
    const root = await makeTempProject({
      'scripts/player.gd': `extends Sprite2D

var tex = preload("res://textures/player.png")
var scene = preload("res://scenes/level.tscn")
`,
      'scenes/level.tscn': `[gd_scene format=3]
[node name="Level"]
`,
    })

    const index = await buildMetadataIndex(root)
    const gd = index.files['scripts/player.gd']
    expect(gd?.assetRefs).toBeDefined()
    expect(gd?.assetRefs?.length).toBe(2)

    // The .gd should have a reference edge to the .tscn (which is indexed).
    // player.png is binary (BINARY_EXTENSIONS), so it won't be in the index
    // and won't get an edge — but level.tscn IS a text file and indexed.
    const gdRefEdges = index.graph.edges.filter(
      (e) =>
        e.type === 'references' &&
        e.from === 'file:scripts/player.gd',
    )
    expect(
      gdRefEdges.some((e) => e.to === 'file:scenes/level.tscn'),
    ).toBe(true)
  })

  test('non-asset files do not get assetRefs field', async () => {
    const root = await makeTempProject({
      'src/main.ts': 'export const x = 1\n',
      'README.md': '# Project\n',
    })

    const index = await buildMetadataIndex(root)
    expect(index.files['src/main.ts']?.assetRefs).toBeUndefined()
    expect(index.files['README.md']?.assetRefs).toBeUndefined()
  })

  test('assetRefs are undefined (not empty array) for non-asset files', async () => {
    const root = await makeTempProject({
      'src/main.ts': 'export const x = 1\n',
    })

    const index = await buildMetadataIndex(root)
    // assetRefs uses conditional spread, so non-asset files have NO field at all.
    expect(index.files['src/main.ts']?.assetRefs).toBeUndefined()
    // Verify the key is not present, not just falsy.
    expect('assetRefs' in (index.files['src/main.ts'] ?? {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Binary file skip: file-walker and indexer defense-in-depth
// ---------------------------------------------------------------------------

describe('asset-refs: binary file skip', () => {
  test('binary asset files (.png, .fbx, .uasset) are NOT in the index', async () => {
    const root = await makeTempProject({
      'Assets/Textures/player.png': '\x89PNG\r\n\x1a\n' + 'x'.repeat(100),
      'Assets/Models/character.fbx': 'Kaydara FBX Binary\x00' + 'x'.repeat(100),
      'Content/Meshes/world.uasset': '\x00\x01\x02' + 'x'.repeat(100),
      'Assets/Scripts/Player.cs': 'public class Player { }\n',
    })

    const index = await buildMetadataIndex(root)
    // Binary files should NOT be indexed at all (file-walker skips them).
    expect(index.files['Assets/Textures/player.png']).toBeUndefined()
    expect(index.files['Assets/Models/character.fbx']).toBeUndefined()
    expect(index.files['Content/Meshes/world.uasset']).toBeUndefined()
    // Text files ARE indexed.
    expect(index.files['Assets/Scripts/Player.cs']).toBeDefined()
  })

  test('binary files do not get garbage imports or assetRefs', async () => {
    const root = await makeTempProject({
      'Assets/big_texture.png': '\x89PNG' + '\x00'.repeat(500),
      'Assets/Referral.prefab': `%YAML 1.1\n--- !u!1001 &1\nPrefabInstance:\n  m_Modifications:\n    - target: {fileID: 1, guid: abcdef0123456789abcdef0123456789}\n`,
      'Assets/big_texture.png.meta': `fileFormatVersion: 2\nguid: abcdef0123456789abcdef0123456789\n`,
    })

    const index = await buildMetadataIndex(root)
    // The .png is binary — it should NOT be in the index.
    expect(index.files['Assets/big_texture.png']).toBeUndefined()
    // The .meta IS in the index (text YAML) and has assetRefs.
    expect(index.files['Assets/big_texture.png.meta']).toBeDefined()
    expect(index.files['Assets/big_texture.png.meta']?.assetRefs).toBeDefined()
    // The .prefab references the GUID, and the edge resolves to the .meta file.
    const refEdges = index.graph.edges.filter(
      (e) => e.from === 'file:Assets/Referral.prefab' && e.type === 'references',
    )
    expect(refEdges.some((e) => e.to === 'file:Assets/big_texture.png.meta')).toBe(true)
  })

  test('Unity text files (.meta, .prefab, .unity) ARE indexed as text', async () => {
    const root = await makeTempProject({
      'Assets/player.meta': 'fileFormatVersion: 2\nguid: 1234567890abcdef1234567890abcdef\n',
      'Assets/player.prefab': '%YAML 1.1\n--- !u!1 &1\nGameObject:\n  m_Name: Player\n',
      'Assets/scene.unity': '%YAML 1.1\n--- !u!1 &1\nGameObject:\n  m_Name: Scene\n',
    })

    const index = await buildMetadataIndex(root)
    // Unity text serialization files should be in the index.
    expect(index.files['Assets/player.meta']).toBeDefined()
    expect(index.files['Assets/player.prefab']).toBeDefined()
    expect(index.files['Assets/scene.unity']).toBeDefined()
    // And .meta should have assetRefs with the self-identifying GUID.
    expect(index.files['Assets/player.meta']?.assetRefs).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Reference graph queries: neighbors mode finds asset ref edges
// ---------------------------------------------------------------------------

describe('asset-refs: reference graph queries', () => {
  test('queryIndex neighbors finds Godot .gd preload reference targets', async () => {
    const root = await makeTempProject({
      'scripts/player.gd': `extends Sprite2D

var scene = preload("res://scenes/level.tscn")
var tex = preload("res://textures/icon.png")
`,
      'scenes/level.tscn': `[gd_scene format=3]\n[node name="Level"]\n`,
    })

    const index = await buildMetadataIndex(root)

    // Query neighbors from the .gd file — should find the .tscn via the
    // asset reference edge (res_path → references edge).
    const neighbors = queryIndex(index, 'preload scene', {
      mode: 'neighbors',
      from: 'scripts/player.gd',
      limit: 10,
    })

    const paths = neighbors.map((n) => n.path)
    expect(paths).toContain('scenes/level.tscn')
  })

  test('queryIndex neighbors finds Unity .prefab GUID reference targets', async () => {
    const root = await makeTempProject({
      'Assets/hero.png.meta': `fileFormatVersion: 2\nguid: abcdef0123456789abcdef0123456789\n`,
      'Assets/Player.prefab': `%YAML 1.1\n--- !u!1001 &1\nPrefabInstance:\n  m_Modifications:\n    - target: {fileID: 1, guid: abcdef0123456789abcdef0123456789}\n      value: Player\n`,
    })

    const index = await buildMetadataIndex(root)

    // Query neighbors from the prefab — should find the .meta file via the
    // GUID reference edge (guid → resolved via GUID map → .meta fallback).
    const neighbors = queryIndex(index, 'hero texture', {
      mode: 'neighbors',
      from: 'Assets/Player.prefab',
      limit: 10,
    })

    const paths = neighbors.map((n) => n.path)
    expect(paths.some((p) => p === 'Assets/hero.png.meta')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Multi-engine project: Unity + Godot together
// ---------------------------------------------------------------------------

describe('asset-refs: multi-engine project', () => {
  test('Unity and Godot assets coexist with correct edge types', async () => {
    const root = await makeTempProject({
      // Unity side
      'ProjectSettings/ProjectVersion.txt': '2020.3.0f1\n',
      'Assets/textures/hero.png.meta': `fileFormatVersion: 2\nguid: aaaabbbbccccddddeeeeffff00001111\n`,
      'Assets/prefabs/Hero.prefab': `%YAML 1.1\n--- !u!1001 &1\nPrefabInstance:\n  m_Modifications:\n    - target: {fileID: 1, guid: aaaabbbbccccddddeeeeffff00001111}\n`,
      // Godot side
      'project.godot': 'config_version=5\napplication/name="MultiEngine"\n',
      'addons/tool/tool.gd': 'extends EditorPlugin\n',
      'godot_scenes/maze.tscn': `[gd_scene format=3]\n[ext_resource path="res://addons/tool/tool.gd" id="1"]\n[node name="Maze"]\n`,
      // Shared code
      'src/main.ts': 'console.log("hello")\n',
    })

    const index = await buildMetadataIndex(root)

    // Unity files indexed
    expect(index.files['Assets/textures/hero.png.meta']).toBeDefined()
    expect(index.files['Assets/prefabs/Hero.prefab']).toBeDefined()
    expect(index.files['ProjectSettings/ProjectVersion.txt']).toBeDefined()

    // Godot files indexed
    expect(index.files['project.godot']).toBeDefined()
    expect(index.files['addons/tool/tool.gd']).toBeDefined()
    expect(index.files['godot_scenes/maze.tscn']).toBeDefined()

    // Shared code indexed
    expect(index.files['src/main.ts']).toBeDefined()

    // Unity: .prefab → .meta reference edge (GUID resolution)
    const unityEdges = index.graph.edges.filter(
      (e) =>
        e.from === 'file:Assets/prefabs/Hero.prefab' &&
        e.type === 'references',
    )
    expect(
      unityEdges.some((e) => e.to === 'file:Assets/textures/hero.png.meta'),
    ).toBe(true)

    // Godot: .tscn → .gd reference edge (ext_resource res:// resolution)
    const godotEdges = index.graph.edges.filter(
      (e) =>
        e.from === 'file:godot_scenes/maze.tscn' &&
        e.type === 'references',
    )
    expect(
      godotEdges.some((e) => e.to === 'file:addons/tool/tool.gd'),
    ).toBe(true)

    // The .png binary file is NOT in the index.
    expect(index.files['Assets/textures/hero.png']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function makeTempProject(files: Record<string, string>): Promise<string> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codebuff-asset-refs-'))
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.promises.writeFile(absolutePath, content, 'utf8')
  }
  return root
}
