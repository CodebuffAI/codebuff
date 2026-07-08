import { describe, expect, test } from 'bun:test'

import {
  detectEngineProfiles,
  formatEngineProfilePrompt,
  formatEngineProfilePromptForFileTree,
} from '../engine-profiles'

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

// ---------------------------------------------------------------------------
// Unity detection
// ---------------------------------------------------------------------------

describe('engine profile detection — Unity', () => {
  test('detects Unity via ProjectSettings/ProjectVersion.txt manifest', () => {
    const tree: FileTreeNode[] = [
      directory('ProjectSettings', [
        file('ProjectVersion.txt', 'ProjectSettings/ProjectVersion.txt'),
      ]),
      directory('Assets', [
        file('Player.cs', 'Assets/Scripts/Player.cs'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unity'])
  })

  test('detects Unity via .unity scene files', () => {
    const tree: FileTreeNode[] = [
      directory('Assets', [
        file('MainScene.unity', 'Assets/Scenes/MainScene.unity'),
        file('Player.prefab', 'Assets/Prefabs/Player.prefab'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unity'])
  })

  test('detects Unity via .asmdef assembly definition', () => {
    const tree: FileTreeNode[] = [
      file('MyGame.asmdef'),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unity'])
  })

  test('detects Unity via Assets/ directory pattern', () => {
    const tree: FileTreeNode[] = [
      directory('Assets', [
        file('readme.md', 'Assets/readme.md'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unity'])
  })

  test('detects Unity via ProjectSettings/ directory pattern', () => {
    const tree: FileTreeNode[] = [
      directory('ProjectSettings', [
        file('ProjectSettings.asset', 'ProjectSettings/ProjectSettings.asset'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unity'])
  })

  test('does not detect Unity from .csproj alone (could be any C# project)', () => {
    const tree: FileTreeNode[] = [
      file('MyApp.csproj'),
    ]
    // .csproj is not a unique Unity signal — it's in the language profile instead
    const result = detectEngineProfiles(tree)
    expect(result.find((p) => p.id === 'unity')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Godot detection
// ---------------------------------------------------------------------------

describe('engine profile detection — Godot', () => {
  test('detects Godot via project.godot manifest', () => {
    const tree: FileTreeNode[] = [
      file('project.godot'),
      directory('scenes', [
        file('Main.tscn', 'scenes/Main.tscn'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['godot'])
  })

  test('detects Godot via .tscn scene files', () => {
    const tree: FileTreeNode[] = [
      file('Level1.tscn'),
      file('Player.gd'),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['godot'])
  })

  test('detects Godot via .tres resource files', () => {
    const tree: FileTreeNode[] = [
      file('Character.tres'),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['godot'])
  })

  test('detects Godot via .gd GDScript files', () => {
    const tree: FileTreeNode[] = [
      file('PlayerController.gd'),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['godot'])
  })

  test('detects Godot via addons/ directory', () => {
    const tree: FileTreeNode[] = [
      directory('addons', [
        file('plugin.cfg', 'addons/my_plugin/plugin.cfg'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['godot'])
  })
})

// ---------------------------------------------------------------------------
// Unreal detection
// ---------------------------------------------------------------------------

describe('engine profile detection — Unreal', () => {
  test('detects Unreal via .uproject manifest', () => {
    const tree: FileTreeNode[] = [
      file('MyGame.uproject'),
      directory('Source', [
        file('MyGame.Build.cs', 'Source/MyGame/MyGame.Build.cs'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unreal'])
  })

  test('detects Unreal via .uasset files', () => {
    const tree: FileTreeNode[] = [
      directory('Content', [
        file('Hero.uasset', 'Content/Hero.uasset'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unreal'])
  })

  test('detects Unreal via .umap files', () => {
    const tree: FileTreeNode[] = [
      file('Level1.umap'),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unreal'])
  })

  test('detects Unreal via Content/ directory', () => {
    const tree: FileTreeNode[] = [
      directory('Content', [
        file('texture.png', 'Content/Textures/texture.png'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unreal'])
  })

  test('detects Unreal via Config/ directory', () => {
    const tree: FileTreeNode[] = [
      directory('Config', [
        file('DefaultEngine.ini', 'Config/DefaultEngine.ini'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['unreal'])
  })
})

// ---------------------------------------------------------------------------
// Bevy detection
// ---------------------------------------------------------------------------

describe('engine profile detection — Bevy', () => {
  test('detects Bevy via Cargo.toml + assets/ heuristic', () => {
    const tree: FileTreeNode[] = [
      file('Cargo.toml'),
      directory('src', [
        file('main.rs', 'src/main.rs'),
      ]),
      directory('assets', [
        file('player.png', 'assets/player.png'),
      ]),
    ]
    expect(detectEngineProfiles(tree).map((p) => p.id)).toEqual(['bevy'])
  })

  test('does not detect Bevy from Cargo.toml alone (could be any Rust project)', () => {
    const tree: FileTreeNode[] = [
      file('Cargo.toml'),
      directory('src', [
        file('main.rs', 'src/main.rs'),
      ]),
    ]
    expect(detectEngineProfiles(tree)).toEqual([])
  })

  test('does not detect Bevy from assets/ alone (could be any project)', () => {
    const tree: FileTreeNode[] = [
      directory('assets', [
        file('image.png', 'assets/image.png'),
      ]),
    ]
    expect(detectEngineProfiles(tree)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Multi-engine and mixed repos
// ---------------------------------------------------------------------------

describe('engine profile detection — mixed repos', () => {
  test('detects multiple engines in the same repo', () => {
    // A repo with both Unity and Godot projects (e.g., a monorepo or migration)
    const tree: FileTreeNode[] = [
      directory('unity', [
        directory('ProjectSettings', [
          file('ProjectVersion.txt', 'unity/ProjectSettings/ProjectVersion.txt'),
        ]),
        directory('Assets', [
          file('Scene.unity', 'unity/Assets/Scenes/Scene.unity'),
        ]),
      ]),
      directory('godot', [
        file('project.godot', 'godot/project.godot'),
        file('Main.tscn', 'godot/Main.tscn'),
      ]),
    ]
    const result = detectEngineProfiles(tree).map((p) => p.id)
    expect(result).toContain('unity')
    expect(result).toContain('godot')
  })

  test('detects Unity alongside non-game code (mixed repo)', () => {
    const tree: FileTreeNode[] = [
      directory('ProjectSettings', [
        file('ProjectVersion.txt', 'ProjectSettings/ProjectVersion.txt'),
      ]),
      directory('Assets', [
        file('Player.cs', 'Assets/Scripts/Player.cs'),
      ]),
      file('package.json'),
      directory('tools', [
        file('build.js', 'tools/build.js'),
      ]),
    ]
    const result = detectEngineProfiles(tree).map((p) => p.id)
    expect(result).toEqual(['unity'])
  })

  test('game-dev repo with Bevy + web tools', () => {
    const tree: FileTreeNode[] = [
      file('Cargo.toml'),
      directory('src', [
        file('main.rs', 'src/main.rs'),
        file('systems.rs', 'src/systems.rs'),
      ]),
      directory('assets', [
        file('sprites.png', 'assets/sprites.png'),
        file('font.ttf', 'assets/font.ttf'),
      ]),
      file('package.json'),
      directory('web', [
        file('index.ts', 'web/index.ts'),
      ]),
    ]
    const result = detectEngineProfiles(tree).map((p) => p.id)
    expect(result).toEqual(['bevy'])
  })

  test('non-game repo produces no engine profiles', () => {
    const tree: FileTreeNode[] = [
      file('package.json'),
      directory('src', [
        file('index.ts', 'src/index.ts'),
        file('App.tsx', 'src/App.tsx'),
      ]),
      file('tsconfig.json'),
    ]
    expect(detectEngineProfiles(tree)).toEqual([])
  })

  test('empty file tree produces no engine profiles', () => {
    expect(detectEngineProfiles([])).toEqual([])
  })

  test('preserves stable engine order (unity, godot, unreal, bevy)', () => {
    // Create a repo with all four engines detected
    const tree: FileTreeNode[] = [
      // Unity
      directory('ProjectSettings', [
        file('ProjectVersion.txt', 'ProjectSettings/ProjectVersion.txt'),
      ]),
      // Godot
      file('project.godot'),
      // Unreal
      file('Game.uproject'),
      // Bevy
      file('Cargo.toml'),
      directory('assets', [
        file('texture.png', 'assets/texture.png'),
      ]),
    ]
    const result = detectEngineProfiles(tree).map((p) => p.id)
    expect(result).toEqual(['unity', 'godot', 'unreal', 'bevy'])
  })
})

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------

describe('engine profile prompt formatting', () => {
  test('returns empty string when no engine is detected', () => {
    expect(formatEngineProfilePrompt({ profiles: [] })).toBe('')
    expect(formatEngineProfilePromptForFileTree([file('README.md')])).toBe('')
  })

  test('returns empty string for non-game project', () => {
    const tree: FileTreeNode[] = [
      file('package.json'),
      directory('src', [file('index.ts', 'src/index.ts')]),
    ]
    expect(formatEngineProfilePromptForFileTree(tree)).toBe('')
  })

  test('renders Unity profile with guidance and header', () => {
    const tree: FileTreeNode[] = [
      directory('ProjectSettings', [
        file('ProjectVersion.txt', 'ProjectSettings/ProjectVersion.txt'),
      ]),
      directory('Assets', [
        file('Scene.unity', 'Assets/Scenes/Scene.unity'),
      ]),
    ]
    const prompt = formatEngineProfilePromptForFileTree(tree)
    expect(prompt).toContain('## Engine profile')
    expect(prompt).toContain('Detected: Unity')
    expect(prompt).toContain('Unity')
    expect(prompt).toContain('GUID references')
    expect(prompt).toContain('game-engine project')
  })

  test('renders Godot profile with ExtResource/SubResource guidance', () => {
    const tree: FileTreeNode[] = [
      file('project.godot'),
      file('Main.tscn'),
    ]
    const prompt = formatEngineProfilePromptForFileTree(tree)
    expect(prompt).toContain('Detected: Godot')
    expect(prompt).toContain('ExtResource')
    expect(prompt).toContain('SubResource')
    expect(prompt).toContain('GDScript')
  })

  test('renders Unreal profile with .uasset/.umap guidance', () => {
    const tree: FileTreeNode[] = [
      file('MyGame.uproject'),
      directory('Content', [
        file('Hero.uasset', 'Content/Hero.uasset'),
      ]),
    ]
    const prompt = formatEngineProfilePromptForFileTree(tree)
    expect(prompt).toContain('Detected: Unreal Engine')
    expect(prompt).toContain('.uasset')
    expect(prompt).toContain('Blueprint')
  })

  test('renders Bevy profile with ECS guidance', () => {
    const tree: FileTreeNode[] = [
      file('Cargo.toml'),
      directory('assets', [
        file('player.png', 'assets/player.png'),
      ]),
    ]
    const prompt = formatEngineProfilePromptForFileTree(tree)
    expect(prompt).toContain('Detected: Bevy')
    expect(prompt).toContain('ECS')
    expect(prompt).toContain('Bevy')
  })

  test('renders multiple engine profiles when several are detected', () => {
    const tree: FileTreeNode[] = [
      directory('ProjectSettings', [
        file('ProjectVersion.txt', 'ProjectSettings/ProjectVersion.txt'),
      ]),
      file('project.godot'),
      file('Game.uproject'),
    ]
    const prompt = formatEngineProfilePromptForFileTree(tree)
    expect(prompt).toContain('Unity')
    expect(prompt).toContain('Godot')
    expect(prompt).toContain('Unreal Engine')
    // Multiple engines are comma-separated in Detected line
    expect(prompt).toMatch(/Detected: .*Unity.*Godot.*Unreal/)
  })

  test('does not render engine guidance for non-game C# project', () => {
    const tree: FileTreeNode[] = [
      file('MyApp.csproj'),
      directory('src', [
        file('Program.cs', 'src/Program.cs'),
      ]),
    ]
    const prompt = formatEngineProfilePromptForFileTree(tree)
    // No engine profile should be rendered — .csproj alone is not a Unity signal
    expect(prompt).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Integration with language profiles (confirm no interference)
// ---------------------------------------------------------------------------

describe('engine profile — non-interference with language profiles', () => {
  test('a Unity repo with C# files detects unity engine without affecting language detection', () => {
    // This test confirms the engine detection module runs independently.
    // Language detection is handled by language-profiles.ts.
    const tree: FileTreeNode[] = [
      directory('ProjectSettings', [
        file('ProjectVersion.txt', 'ProjectSettings/ProjectVersion.txt'),
      ]),
      directory('Assets', [
        file('Player.cs', 'Assets/Scripts/Player.cs'),
        file('Scene.unity', 'Assets/Scenes/Scene.unity'),
      ]),
    ]
    const engineProfiles = detectEngineProfiles(tree)
    expect(engineProfiles.map((p) => p.id)).toEqual(['unity'])
    // The engine profile has guidance but not idiom file pointers
    expect(engineProfiles[0]).not.toHaveProperty('idiomFile')
  })
})
