import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { BINARY_EXTENSIONS, walkProject } from './file-walker'

// ---------------------------------------------------------------------------
// BINARY_EXTENSIONS set
// ---------------------------------------------------------------------------

describe('file-walker BINARY_EXTENSIONS', () => {
  test('is a non-empty Set of lowercase strings starting with a dot', () => {
    expect(BINARY_EXTENSIONS).toBeInstanceOf(Set)
    expect(BINARY_EXTENSIONS.size).toBeGreaterThan(0)
    for (const ext of BINARY_EXTENSIONS) {
      expect(typeof ext).toBe('string')
      expect(ext.startsWith('.')).toBe(true)
      expect(ext).toBe(ext.toLowerCase())
    }
  })

  test('includes game engine binary asset formats', () => {
    for (const ext of [
      '.uasset',
      '.umap',
      '.assets',
      '.fbx',
      '.obj',
      '.dae',
      '.3ds',
      '.blend',
    ]) {
      expect(BINARY_EXTENSIONS.has(ext)).toBe(true)
    }
  })

  test('includes standard image formats', () => {
    for (const ext of [
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
    ]) {
      expect(BINARY_EXTENSIONS.has(ext)).toBe(true)
    }
  })

  test('includes audio, video, and animation binary formats', () => {
    for (const ext of [
      '.mp3',
      '.wav',
      '.ogg',
      '.flac',
      '.mp4',
      '.mov',
      '.avi',
      '.mkv',
      '.webm',
      '.anim',
      '.controller',
      '.mat',
    ]) {
      expect(BINARY_EXTENSIONS.has(ext)).toBe(true)
    }
  })

  test('includes compiled, archive, and binary container formats', () => {
    for (const ext of [
      '.class',
      '.jar',
      '.war',
      '.dll',
      '.lib',
      '.exe',
      '.so',
      '.dylib',
      '.zip',
      '.tar',
      '.gz',
      '.rar',
      '.7z',
      '.pdf',
      '.docx',
      '.xlsx',
      '.sqlite',
      '.db',
      '.bin',
      '.dat',
    ]) {
      expect(BINARY_EXTENSIONS.has(ext)).toBe(true)
    }
  })

  test('does NOT include Unity text serialization formats (.meta, .prefab, .unity)', () => {
    // These are YAML text in Unity's text serialization mode — they need to be
    // indexed as text so the asset reference extractor can parse them.
    expect(BINARY_EXTENSIONS.has('.meta')).toBe(false)
    expect(BINARY_EXTENSIONS.has('.prefab')).toBe(false)
    expect(BINARY_EXTENSIONS.has('.unity')).toBe(false)
  })

  test('does NOT include Godot text formats (.tscn, .tres, .gd)', () => {
    expect(BINARY_EXTENSIONS.has('.tscn')).toBe(false)
    expect(BINARY_EXTENSIONS.has('.tres')).toBe(false)
    expect(BINARY_EXTENSIONS.has('.gd')).toBe(false)
  })

  test('does NOT include Unreal .uproject (JSON text)', () => {
    expect(BINARY_EXTENSIONS.has('.uproject')).toBe(false)
  })

  test('does NOT include source code or config extensions', () => {
    for (const ext of [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.cs',
      '.rs',
      '.go',
      '.rb',
      '.php',
      '.swift',
      '.kt',
      '.md',
      '.json',
      '.yaml',
      '.yml',
      '.toml',
    ]) {
      expect(BINARY_EXTENSIONS.has(ext)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// walkProject binary skip behavior
// ---------------------------------------------------------------------------

async function makeTempProject(
  files: Record<string, string>,
): Promise<string> {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codebuff-walker-'),
  )
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.promises.writeFile(absolutePath, content, 'utf8')
  }
  return root
}

describe('file-walker walkProject', () => {
  test('skips binary files during walk', async () => {
    const root = await makeTempProject({
      'src/main.ts': 'export const x = 1\n',
      'assets/player.png': '\x89PNG fake binary\n',
      'assets/model.fbx': 'binary fbx data\n',
      'assets/scene.uasset': 'unreal binary\n',
    })

    const files = await walkProject(root)
    const relPaths = files.map((f) => f.relativePath)
    expect(relPaths).toContain('src/main.ts')
    expect(relPaths).not.toContain('assets/player.png')
    expect(relPaths).not.toContain('assets/model.fbx')
    expect(relPaths).not.toContain('assets/scene.uasset')
  })

  test('includes Unity text serialization files (.meta, .prefab, .unity)', async () => {
    const root = await makeTempProject({
      'Assets/Main.unity': '%YAML 1.1\n--- !u!1001\n',
      'Assets/Player.prefab.meta': 'guid: abc123\n',
      'Assets/Player.prefab': '%YAML 1.1\n--- \n',
    })

    const files = await walkProject(root)
    const relPaths = files.map((f) => f.relativePath)
    expect(relPaths).toContain('Assets/Main.unity')
    expect(relPaths).toContain('Assets/Player.prefab.meta')
    expect(relPaths).toContain('Assets/Player.prefab')
  })

  test('includes Godot text files (.tscn, .tres, .gd)', async () => {
    const root = await makeTempProject({
      'Scenes/Main.tscn': '[ext_resource path="res://player.png" ...]\n',
      'Scripts/player.gd': 'extends Node2D\n',
      'Resources/health.tres': '[resource]\n',
    })

    const files = await walkProject(root)
    const relPaths = files.map((f) => f.relativePath)
    expect(relPaths).toContain('Scenes/Main.tscn')
    expect(relPaths).toContain('Scripts/player.gd')
    expect(relPaths).toContain('Resources/health.tres')
  })

  test('includes Unreal .uproject (JSON text)', async () => {
    const root = await makeTempProject({
      'MyGame.uproject': '{"Modules": [{"Name": "MyGame"}]}\n',
    })

    const files = await walkProject(root)
    const relPaths = files.map((f) => f.relativePath)
    expect(relPaths).toContain('MyGame.uproject')
  })

  test('returns WalkedFile with ext as lowercase', async () => {
    const root = await makeTempProject({
      'src/Index.TS': 'export const x = 1\n',
      'data/config.JSON': '{}\n',
    })

    const files = await walkProject(root)
    const tsFile = files.find((f) => f.relativePath === 'src/Index.TS')
    const jsonFile = files.find((f) => f.relativePath === 'data/config.JSON')
    expect(tsFile?.ext).toBe('.ts')
    expect(jsonFile?.ext).toBe('.json')
  })

  test('walks an empty directory and returns []', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'codebuff-walker-'),
    )
    const files = await walkProject(root)
    expect(files).toEqual([])
  })
})
