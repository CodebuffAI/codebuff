import { describe, expect, test } from 'bun:test'

import {
  detectLanguageProfiles,
  formatLanguageProfilePrompt,
  formatLanguageProfilePromptForFileTree,
} from '../language-profiles'

import type { FileTreeNode } from '../file'

const file = (name: string, filePath = name): FileTreeNode => ({
  name,
  type: 'file',
  filePath,
  lastReadTime: 0,
})

const directory = (
  name: string,
  children: FileTreeNode[],
  filePath = name,
): FileTreeNode => ({
  name,
  type: 'directory',
  filePath,
  children,
})

describe('language profile prompts', () => {
  test('detects supported languages from nested file extensions and manifests', () => {
    const tree: FileTreeNode[] = [
      file('README.md'),
      file('go.mod'),
      file('pom.xml'),
      file('App.csproj'),
      file('Gemfile'),
      file('composer.json'),
      file('Package.swift'),
      file('build.gradle.kts'),
      file('project.godot'),
      directory('src', [
        file('main.py', 'src/main.py'),
        file('lib.rs', 'src/lib.rs'),
        file('App.tsx', 'src/App.tsx'),
        file('native.hpp', 'src/native.hpp'),
      ]),
    ]

    expect(detectLanguageProfiles(tree).map((profile) => profile.id)).toEqual([
      'typescript',
      'python',
      'rust',
      'go',
      'java',
      'csharp',
      'cpp',
      'ruby',
      'php',
      'swift',
      'kotlin',
      'gdscript',
    ])
  })

  test('deduplicates repeated signals and preserves stable language order', () => {
    const tree: FileTreeNode[] = [
      file('requirements.txt'),
      file('pyproject.toml'),
      directory('pkg', [file('server.go', 'pkg/server.go')]),
      file('package.json'),
      file('index.ts'),
    ]

    expect(detectLanguageProfiles(tree).map((profile) => profile.id)).toEqual([
      'typescript',
      'python',
      'go',
    ])
  })

  test('detects code-map-supported language extensions', () => {
    const cases: Array<[string, string]> = [
      ['server.java', 'java'],
      ['Program.cs', 'csharp'],
      ['native.cpp', 'cpp'],
      ['native.c', 'cpp'],
      ['native.hpp', 'cpp'],
      ['model.rb', 'ruby'],
      ['index.php', 'php'],
      ['Package.swift', 'swift'],
      ['Main.kt', 'kotlin'],
      ['build.gradle.kts', 'kotlin'],
      ['Player.gd', 'gdscript'],
    ]

    for (const [name, id] of cases) {
      expect(detectLanguageProfiles([file(name)]).map((profile) => profile.id)).toEqual([
        id,
      ])
    }
  })

  test('detects supported language manifests', () => {
    const cases: Array<[string, string]> = [
      ['pom.xml', 'java'],
      ['build.gradle', 'java'],
      ['App.csproj', 'csharp'],
      ['Solution.sln', 'csharp'],
      ['Gemfile', 'ruby'],
      ['example.gemspec', 'ruby'],
      ['composer.json', 'php'],
      ['Package.swift', 'swift'],
      ['settings.gradle.kts', 'kotlin'],
      ['project.godot', 'gdscript'],
    ]

    for (const [name, id] of cases) {
      expect(detectLanguageProfiles([file(name)]).map((profile) => profile.id)).toEqual([
        id,
      ])
    }
  })

  test('ignores empty directories, hidden files, and unsupported extensions', () => {
    const tree: FileTreeNode[] = [
      directory('empty', []),
      file('.env'),
      file('archive.tar.gz'),
      file('Makefile'),
      directory('docs', [file('guide.md', 'docs/guide.md')]),
    ]

    expect(detectLanguageProfiles(tree)).toEqual([])
  })

  test('normalizes source-file extension casing', () => {
    expect(detectLanguageProfiles([file('APP.TSX')]).map((profile) => profile.id)).toEqual([
      'typescript',
    ])
    expect(detectLanguageProfiles([file('SCRIPT.PY')]).map((profile) => profile.id)).toEqual([
      'python',
    ])
  })

  test('keeps manifest filename matching case-sensitive', () => {
    expect(detectLanguageProfiles([file('package.JSON')])).toEqual([])
    expect(detectLanguageProfiles([file('Package.swift')]).map((profile) => profile.id)).toEqual([
      'swift',
    ])
  })

  test('returns an empty prompt when no supported language is detected', () => {
    expect(formatLanguageProfilePrompt({ profiles: [] })).toBe('')
    expect(formatLanguageProfilePromptForFileTree([file('README.md')])).toBe('')
  })

  test('renders compact guidance that points to idiom files without inlining them', () => {
    const prompt = formatLanguageProfilePromptForFileTree([
      file('Cargo.toml'),
      directory('src', [file('main.rs', 'src/main.rs')]),
    ])

    expect(prompt).toContain('## Language profile')
    expect(prompt).toContain('Detected: Rust')
    expect(prompt).toContain('Use language-native idioms')
    expect(prompt).toContain('`read_files` `agents/idioms/rust.md`')
    expect(prompt).not.toContain('Let ownership and borrowing drive the design')
  })

  test('detects GDScript from .gd extension and project.godot manifest', () => {
    // Extension-based detection
    expect(
      detectLanguageProfiles([file('PlayerController.gd')]).map((p) => p.id),
    ).toEqual(['gdscript'])

    // Manifest-based detection
    expect(
      detectLanguageProfiles([file('project.godot')]).map((p) => p.id),
    ).toEqual(['gdscript'])

    // Case-insensitive extension
    expect(
      detectLanguageProfiles([file('PlayerController.GD')]).map((p) => p.id),
    ).toEqual(['gdscript'])
  })

  test('renders GDScript profile guidance with idiom file pointer', () => {
    const prompt = formatLanguageProfilePromptForFileTree([
      file('project.godot'),
      directory('scripts', [file('Player.gd', 'scripts/Player.gd')]),
    ])

    expect(prompt).toContain('## Language profile')
    expect(prompt).toContain('Detected: GDScript')
    expect(prompt).toContain('Godot node conventions')
    expect(prompt).toContain('`read_files` `agents/idioms/gdscript.md`')
  })

  test('renders only relevant idiom file pointers for detected languages', () => {
    const prompt = formatLanguageProfilePromptForFileTree([
      file('composer.json'),
      directory('src', [file('Controller.php', 'src/Controller.php')]),
    ])

    expect(prompt).toContain('Detected: PHP')
    expect(prompt).toContain('`read_files` `agents/idioms/php.md`')
    expect(prompt).not.toContain('agents/idioms/python.md')
    expect(prompt).not.toContain('agents/idioms/rust.md')
    expect(prompt).not.toContain('agents/idioms/kotlin.md')
  })
})
