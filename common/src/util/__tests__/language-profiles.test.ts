import { describe, expect, test } from 'bun:test'

import {
  LANGUAGE_CAPABILITY_REGISTRY,
  detectLanguageIdForPath,
  detectLanguageProfiles,
  detectLanguageProfilesFromPaths,
  detectLanguageProfilesFromTask,
  formatLanguageProfilePrompt,
  formatLanguageProfilePromptForFileTree,
  selectLanguageProfiles,
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
      file('Main.kt'),
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
      ['Player.gd', 'gdscript'],
    ]

    for (const [name, id] of cases) {
      expect(
        detectLanguageProfiles([file(name)]).map((profile) => profile.id),
      ).toEqual([id])
    }
  })

  test('detects supported language manifests', () => {
    const cases: Array<[string, string]> = [
      ['pom.xml', 'java'],
      ['App.csproj', 'csharp'],
      ['Gemfile', 'ruby'],
      ['example.gemspec', 'ruby'],
      ['composer.json', 'php'],
      ['Package.swift', 'swift'],
      ['project.godot', 'gdscript'],
    ]

    for (const [name, id] of cases) {
      expect(
        detectLanguageProfiles([file(name)]).map((profile) => profile.id),
      ).toEqual([id])
    }
  })

  test('does not infer a source language from ambiguous Gradle DSL files', () => {
    expect(
      detectLanguageProfiles([
        file('build.gradle'),
        file('build.gradle.kts'),
        file('settings.gradle.kts'),
      ]),
    ).toEqual([])
  })

  test('does not misclassify F# or Visual Basic projects as C#', () => {
    expect(detectLanguageProfiles([file('Library.fsproj')])).toEqual([])
    expect(detectLanguageProfiles([file('Application.vbproj')])).toEqual([])
    expect(
      detectLanguageProfiles([file('Workspace.sln'), file('Library.fsproj')]),
    ).toEqual([])
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
    expect(
      detectLanguageProfiles([file('APP.TSX')]).map((profile) => profile.id),
    ).toEqual(['typescript'])
    expect(
      detectLanguageProfiles([file('SCRIPT.PY')]).map((profile) => profile.id),
    ).toEqual(['python'])
  })

  test('keeps manifest filename matching case-sensitive', () => {
    expect(detectLanguageProfiles([file('package.JSON')])).toEqual([])
    expect(
      detectLanguageProfiles([file('Package.swift')]).map(
        (profile) => profile.id,
      ),
    ).toEqual(['swift'])
  })

  test('returns an empty prompt when no supported language is detected', () => {
    expect(formatLanguageProfilePrompt({ profiles: [] })).toBe('')
    expect(formatLanguageProfilePromptForFileTree([file('README.md')])).toBe('')
  })

  test('renders bundled idiom guidance without assuming files in the user repo', () => {
    const prompt = formatLanguageProfilePromptForFileTree([
      file('Cargo.toml'),
      directory('src', [file('main.rs', 'src/main.rs')]),
    ])

    expect(prompt).toContain('## Language profile')
    expect(prompt).toContain('Detected: Rust')
    expect(prompt).toContain('Let ownership and borrowing drive the design')
    expect(prompt).toContain('repository-local compiler')
    expect(prompt).not.toContain('agents/idioms/')
    expect(prompt).not.toContain('`read_files`')
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

  test('renders bundled GDScript profile guidance', () => {
    const prompt = formatLanguageProfilePromptForFileTree([
      file('project.godot'),
      directory('scripts', [file('Player.gd', 'scripts/Player.gd')]),
    ])

    expect(prompt).toContain('## Language profile')
    expect(prompt).toContain('Detected: GDScript')
    expect(prompt).toContain('Godot node conventions')
    expect(prompt).toContain('res:// scene/resource references')
    expect(prompt).not.toContain('agents/idioms/gdscript.md')
  })

  test('renders only relevant bundled guidance for detected languages', () => {
    const prompt = formatLanguageProfilePromptForFileTree([
      file('composer.json'),
      directory('src', [file('Controller.php', 'src/Controller.php')]),
    ])

    expect(prompt).toContain('Detected: PHP')
    expect(prompt).toContain('Composer autoloading')
    expect(prompt).not.toContain('context managers')
    expect(prompt).not.toContain('ownership and borrowing')
    expect(prompt).not.toContain('coroutine dispatcher')
  })

  test('deduplicates multiple .gd files into a single GDScript profile', () => {
    const tree: FileTreeNode[] = [
      directory('scripts', [
        file('Player.gd', 'scripts/Player.gd'),
        file('Enemy.gd', 'scripts/Enemy.gd'),
        file('Globals.gd', 'scripts/Globals.gd'),
      ]),
    ]

    const profiles = detectLanguageProfiles(tree)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].id).toBe('gdscript')
  })

  test('detects GDScript alongside other languages in mixed project trees', () => {
    const tree: FileTreeNode[] = [
      file('package.json'),
      file('project.godot'),
      directory('src', [file('App.tsx', 'src/App.tsx')]),
      directory('addons', [file('plugin.cfg', 'addons/plugin.cfg')]),
      directory('scripts', [file('Player.gd', 'scripts/Player.gd')]),
    ]

    expect(detectLanguageProfiles(tree).map((p) => p.id)).toEqual([
      'typescript',
      'gdscript',
    ])
  })

  test('does not detect GDScript from case-variant manifest names', () => {
    // Manifest matching is case-sensitive: Project.Godot is NOT project.godot
    expect(detectLanguageProfiles([file('Project.Godot')])).toEqual([])
    expect(detectLanguageProfiles([file('PROJECT.GODOT')])).toEqual([])
  })

  test('ignores files with .gd-like suffixes that are not .gd', () => {
    expect(detectLanguageProfiles([file('archive.gd.ts')])).not.toContainEqual(
      expect.objectContaining({ id: 'gdscript' }),
    )
    expect(detectLanguageProfiles([file('data.gdjson')])).not.toContainEqual(
      expect.objectContaining({ id: 'gdscript' }),
    )
  })

  test('derives path detection and tool metadata from the canonical registry', () => {
    expect(detectLanguageIdForPath('src\\server\\APP.PY')).toBe('python')
    expect(detectLanguageIdForPath('native/CMakeLists.txt')).toBe('cpp')
    expect(
      detectLanguageProfilesFromPaths([
        'frontend/App.tsx',
        'backend/Cargo.toml',
      ]).map((profile) => profile.id),
    ).toEqual(['typescript', 'rust'])

    expect(LANGUAGE_CAPABILITY_REGISTRY.rust.tools.languageServer).toContain(
      'rust-analyzer',
    )
    expect(LANGUAGE_CAPABILITY_REGISTRY.python.validation.project).toEqual([
      'typecheck',
      'test',
    ])
  })

  test('scopes polyglot profiles to explicit target paths and task languages', () => {
    const tree: FileTreeNode[] = [
      directory('web', [file('App.tsx', 'web/App.tsx')]),
      directory('service', [file('main.py', 'service/main.py')]),
      directory('native', [file('lib.rs', 'native/lib.rs')]),
    ]

    expect(
      selectLanguageProfiles({
        fileTree: tree,
        targetPaths: ['native/lib.rs'],
      }).map((profile) => profile.id),
    ).toEqual(['rust'])

    expect(
      selectLanguageProfiles({
        fileTree: tree,
        targetPaths: ['README.md'],
        taskText: 'Add Pyright-safe Python request validation',
      }).map((profile) => profile.id),
    ).toEqual(['python'])

    const prompt = formatLanguageProfilePromptForFileTree(tree, {
      targetPaths: ['service/main.py'],
    })
    expect(prompt).toContain('Detected: Python')
    expect(prompt).not.toContain('TypeScript/JavaScript')
    expect(prompt).not.toContain('Rust')
  })

  test('uses explicit task signals without treating ordinary lowercase go as Go', () => {
    expect(
      detectLanguageProfilesFromTask('Please go fix the parser').map(
        (profile) => profile.id,
      ),
    ).toEqual([])
    expect(
      detectLanguageProfilesFromTask('Fix the Go parser in parser.go').map(
        (profile) => profile.id,
      ),
    ).toEqual(['go'])
    expect(
      detectLanguageProfilesFromTask('Update JavaScript, not Java').map(
        (profile) => profile.id,
      ),
    ).toEqual(['typescript', 'java'])
  })

  test('falls back to repository languages when no focused signal exists', () => {
    const tree = [file('app.ts'), file('worker.py')]
    expect(
      selectLanguageProfiles({
        fileTree: tree,
        targetPaths: ['README.md'],
        taskText: 'Improve the documentation',
      }).map((profile) => profile.id),
    ).toEqual(['typescript', 'python'])
  })
})
