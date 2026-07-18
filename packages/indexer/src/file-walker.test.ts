import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  BINARY_EXTENSIONS,
  normalizeRelativePath,
  walkProject,
  walkProjectDetailed,
} from './file-walker'

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

test('canonicalizes Windows-style relative paths for portable graph keys', () => {
  expect(normalizeRelativePath('packages\\indexer\\src\\query.ts')).toBe(
    'packages/indexer/src/query.ts',
  )
})

// ---------------------------------------------------------------------------
// walkProject binary skip behavior
// ---------------------------------------------------------------------------

async function makeTempProject(files: Record<string, string>): Promise<string> {
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
  test('applies nested ignore files and mandatory sensitive-path policy', async () => {
    const root = await makeTempProject({
      'src/keep.ts': 'export const keep = true\n',
      'src/.gitignore': 'ignored.ts\n',
      'src/ignored.ts': 'export const secret = true\n',
      'src/.openbuffignore': 'private/\n',
      'src/private/data.ts': 'private\n',
      '.env': 'TOKEN=secret\n',
      '.env.example': 'TOKEN=example\n',
      id_ed25519: 'private key\n',
    })

    const paths = (await walkProject(root)).map((file) => file.relativePath)
    expect(paths).toContain('src/keep.ts')
    expect(paths).toContain('.env.example')
    expect(paths).not.toContain('src/ignored.ts')
    expect(paths).not.toContain('src/private/data.ts')
    expect(paths).not.toContain('.env')
    expect(paths).not.toContain('id_ed25519')
  })

  test('excludes generated operational artifacts by default', async () => {
    const root = await makeTempProject({
      '.agents/sessions/a/findings.md': 'stale audit\n',
      '.agents/custom-agent.ts': 'export default {}\n',
      '.omx/plans/plan.md': 'generated plan\n',
      '.openbuff/artifacts/3d/metadata/hash.json': '{}\n',
      'evals/buffbench/task-base2-lite-error-ab12.json': '{}\n',
      'src/main.ts': 'export const main = true\n',
    })
    expect((await walkProject(root)).map((file) => file.relativePath)).toEqual([
      '.agents/custom-agent.ts',
      'src/main.ts',
    ])
  })

  test('reports deterministic partial coverage when maxFiles is reached', async () => {
    const root = await makeTempProject({
      'a/1.ts': '1',
      'b/2.ts': '2',
      'c/3.ts': '3',
    })
    const result = await walkProjectDetailed(root, [], 2)
    expect(result.files.map((file) => file.relativePath)).toEqual([
      'a/1.ts',
      'b/2.ts',
    ])
    expect(result.truncated).toBe(true)
    expect(result.skippedFiles).toBe(1)
    expect(result.skippedPrefixes).toEqual(['c'])
  })

  test('allocates capped coverage fairly across top-level prefixes', async () => {
    const root = await makeTempProject({
      'a/1.ts': '1',
      'a/2.ts': '2',
      'a/3.ts': '3',
      'b/1.ts': '1',
      'c/1.ts': '1',
    })
    const result = await walkProjectDetailed(root, [], 3)
    expect(result.files.map((file) => file.relativePath)).toEqual([
      'a/1.ts',
      'b/1.ts',
      'c/1.ts',
    ])
    expect(result.skippedPrefixes).toEqual(['a'])
  })
  test('keeps 3D assets as metadata-only candidates and skips other binaries', async () => {
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
    expect(relPaths).toContain('assets/model.fbx')
    expect(
      files.find((file) => file.relativePath === 'assets/model.fbx')?.asset,
    ).toEqual({
      kind: '3d',
      format: 'fbx',
    })
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
