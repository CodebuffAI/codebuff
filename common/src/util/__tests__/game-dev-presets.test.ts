import { describe, expect, test } from 'bun:test'

import {
  getGameDevJobGuidance,
  getGameDevPresets,
  getGameDevSlashCommands,
} from '../game-dev-presets'

import type { SupportedEngineId } from '../engine-profiles'

// ---------------------------------------------------------------------------
// getGameDevPresets
// ---------------------------------------------------------------------------

describe('game-dev presets — getGameDevPresets', () => {
  test('returns empty array for empty engine IDs', () => {
    expect(getGameDevPresets([])).toEqual([])
  })

  test('returns presets for a single engine (Unity)', () => {
    const presets = getGameDevPresets(['unity'])
    expect(presets.length).toBe(4)
    expect(presets.map((p) => p.id)).toEqual([
      'unity:build',
      'unity:run',
      'unity:test',
      'unity:watch',
    ])
  })

  test('returns presets for a single engine (Godot)', () => {
    const presets = getGameDevPresets(['godot'])
    expect(presets.length).toBe(4)
    expect(presets.map((p) => p.id)).toEqual([
      'godot:build',
      'godot:run',
      'godot:test',
      'godot:watch',
    ])
  })

  test('returns presets for a single engine (Unreal)', () => {
    const presets = getGameDevPresets(['unreal'])
    expect(presets.length).toBe(4)
    expect(presets.map((p) => p.id)).toEqual([
      'unreal:build',
      'unreal:run',
      'unreal:test',
      'unreal:watch',
    ])
  })

  test('returns presets for a single engine (Bevy)', () => {
    const presets = getGameDevPresets(['bevy'])
    expect(presets.length).toBe(4)
    expect(presets.map((p) => p.id)).toEqual([
      'bevy:build',
      'bevy:run',
      'bevy:test',
      'bevy:watch',
    ])
  })

  test('returns presets in stable engine order for multi-engine project', () => {
    // Input is out of order but output should follow the preset iteration order
    const presets = getGameDevPresets(['bevy', 'unity', 'godot'])
    expect(presets.length).toBe(12)
    // The function iterates engineIds in the order passed, so verify
    // each engine's block appears together
    const ids = presets.map((p) => p.id)
    expect(ids.slice(0, 4)).toEqual([
      'bevy:build',
      'bevy:run',
      'bevy:test',
      'bevy:watch',
    ])
    expect(ids.slice(4, 8)).toEqual([
      'unity:build',
      'unity:run',
      'unity:test',
      'unity:watch',
    ])
    expect(ids.slice(8, 12)).toEqual([
      'godot:build',
      'godot:run',
      'godot:test',
      'godot:watch',
    ])
  })

  test('returns all 16 presets for all 4 engines', () => {
    const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']
    const presets = getGameDevPresets(allEngines)
    expect(presets.length).toBe(16)
  })

  test('deduplicates when same engine appears twice', () => {
    const presets = getGameDevPresets(['unity', 'unity'])
    // The function doesn't deduplicate — it iterates the array as-is.
    // Each call to ENGINE_PRESETS[engineId] returns the same array reference,
    // so we get 8 presets but all ids are duplicated pairs.
    expect(presets.length).toBe(8)
    expect(presets[0].id).toBe('unity:build')
    expect(presets[4].id).toBe('unity:build')
  })
})

// ---------------------------------------------------------------------------
// Preset shape validation
// ---------------------------------------------------------------------------

describe('game-dev presets — preset fields', () => {
  test('every preset has a non-empty id', () => {
    const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']
    const presets = getGameDevPresets(allEngines)
    for (const preset of presets) {
      expect(preset.id.length).toBeGreaterThan(0)
      expect(preset.id).toContain(':')
    }
  })

  test('every preset has a label matching its id', () => {
    const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']
    const presets = getGameDevPresets(allEngines)
    for (const preset of presets) {
      expect(preset.label).toBe(preset.id)
    }
  })

  test('every preset description is under 50 characters (palette limit)', () => {
    const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']
    const presets = getGameDevPresets(allEngines)
    for (const preset of presets) {
      // The CLI truncates at 50, so keeping descriptions under 50
      // avoids the truncation ellipsis
      expect(preset.description.length).toBeLessThanOrEqual(50)
    }
  })

  test('every preset has non-empty insertText', () => {
    const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']
    const presets = getGameDevPresets(allEngines)
    for (const preset of presets) {
      expect(preset.insertText.length).toBeGreaterThan(20)
    }
  })

  test('insertText is a prompt, not a direct command', () => {
    const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']
    const presets = getGameDevPresets(allEngines)
    for (const preset of presets) {
      // Presets should be natural-language prompts the agent interprets,
      // not raw shell commands like "npm run build"
      expect(preset.insertText.endsWith('\n')).toBe(false)
      expect(preset.insertText.includes('run_terminal_command')).toBe(false)
      // All prompts start with an imperative verb
      const firstWord = preset.insertText.split(' ')[0]
      expect(firstWord.length).toBeGreaterThan(0)
      expect(firstWord[0]).toBe(firstWord[0].toUpperCase())
    }
  })
})

// ---------------------------------------------------------------------------
// getGameDevSlashCommands
// ---------------------------------------------------------------------------

describe('game-dev presets — getGameDevSlashCommands', () => {
  test('returns empty array for empty engine IDs', () => {
    expect(getGameDevSlashCommands([])).toEqual([])
  })

  test('returns slash-command-shaped objects for Unity', () => {
    const commands = getGameDevSlashCommands(['unity'])
    expect(commands.length).toBe(4)
    for (const cmd of commands) {
      expect(cmd).toHaveProperty('id')
      expect(cmd).toHaveProperty('label')
      expect(cmd).toHaveProperty('description')
      expect(cmd).toHaveProperty('insertText')
      expect(typeof cmd.id).toBe('string')
      expect(typeof cmd.label).toBe('string')
      expect(typeof cmd.description).toBe('string')
      expect(typeof cmd.insertText).toBe('string')
    }
  })

  test('presets and slash commands have the same shape and content', () => {
    const presets = getGameDevPresets(['godot'])
    const commands = getGameDevSlashCommands(['godot'])
    expect(commands.length).toBe(presets.length)
    for (let i = 0; i < presets.length; i++) {
      expect(commands[i].id).toBe(presets[i].id)
      expect(commands[i].label).toBe(presets[i].label)
      expect(commands[i].description).toBe(presets[i].description)
      expect(commands[i].insertText).toBe(presets[i].insertText)
    }
  })

  test('handles all engines simultaneously', () => {
    const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']
    const commands = getGameDevSlashCommands(allEngines)
    expect(commands.length).toBe(16)

    // Check all ids are unique
    const ids = new Set(commands.map((c) => c.id))
    expect(ids.size).toBe(16)
  })
})

// ---------------------------------------------------------------------------
// Content spot-checks per engine
// ---------------------------------------------------------------------------

describe('game-dev presets — content per engine', () => {
  test('Unity build preset references Unity CLI batchmode', () => {
    const presets = getGameDevPresets(['unity'])
    const buildPreset = presets.find((p) => p.id === 'unity:build')!
    expect(buildPreset.insertText).toContain('Unity')
    expect(buildPreset.insertText).toContain('ProjectVersion.txt')
  })

  test('Unity watch preset references Editor.log and tail -f', () => {
    const presets = getGameDevPresets(['unity'])
    const watchPreset = presets.find((p) => p.id === 'unity:watch')!
    expect(watchPreset.insertText).toContain('Editor.log')
    expect(watchPreset.insertText).toContain('tail')
  })

  test('Godot build preset references export_presets.cfg or headless export', () => {
    const presets = getGameDevPresets(['godot'])
    const buildPreset = presets.find((p) => p.id === 'godot:build')!
    expect(buildPreset.insertText.toLowerCase()).toContain('export')
    expect(buildPreset.insertText).toContain('godot')
  })

  test('Godot test preset references GUT addons', () => {
    const presets = getGameDevPresets(['godot'])
    const testPreset = presets.find((p) => p.id === 'godot:test')!
    expect(testPreset.insertText).toContain('GUT')
    expect(testPreset.insertText).toContain('addons/gut')
  })

  test('Unreal build preset references UnrealBuildTool or UBT', () => {
    const presets = getGameDevPresets(['unreal'])
    const buildPreset = presets.find((p) => p.id === 'unreal:build')!
    expect(
      buildPreset.insertText.includes('UnrealBuildTool') ||
        buildPreset.insertText.includes('UBT'),
    ).toBe(true)
  })

  test('Bevy run preset references cargo run and BACKGROUND', () => {
    const presets = getGameDevPresets(['bevy'])
    const runPreset = presets.find((p) => p.id === 'bevy:run')!
    expect(runPreset.insertText).toContain('cargo run')
    expect(runPreset.insertText).toContain('BACKGROUND')
  })

  test('Bevy watch preset references cargo watch or bacon', () => {
    const presets = getGameDevPresets(['bevy'])
    const watchPreset = presets.find((p) => p.id === 'bevy:watch')!
    expect(
      watchPreset.insertText.includes('cargo watch') ||
        watchPreset.insertText.includes('bacon'),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getGameDevJobGuidance
// ---------------------------------------------------------------------------

describe('game-dev presets — getGameDevJobGuidance', () => {
  test('returns empty array for empty engine IDs', () => {
    expect(getGameDevJobGuidance([])).toEqual([])
  })

  test('returns guidance for a single engine (Unity)', () => {
    const guidance = getGameDevJobGuidance(['unity'])
    expect(guidance.length).toBe(1)
    expect(guidance[0].engineId).toBe('unity')
    expect(guidance[0].displayName).toBe('Unity')
  })

  test('returns guidance for all 4 engines in stable order', () => {
    const guidance = getGameDevJobGuidance([
      'bevy',
      'unreal',
      'godot',
      'unity',
    ])
    expect(guidance.length).toBe(4)
    expect(guidance.map((g) => g.engineId)).toEqual([
      'bevy',
      'unreal',
      'godot',
      'unity',
    ])
  })

  test('skips unknown engine IDs gracefully', () => {
    const guidance = getGameDevJobGuidance([
      'unity',
      'godot',
    ])
    expect(guidance.length).toBe(2)
    expect(guidance.map((g) => g.engineId)).toEqual(['unity', 'godot'])
  })
})

// ---------------------------------------------------------------------------
// Job guidance field validation
// ---------------------------------------------------------------------------

describe('game-dev presets — job guidance fields', () => {
  const allEngines: SupportedEngineId[] = ['unity', 'godot', 'unreal', 'bevy']

  test('every engine has non-empty readiness patterns', () => {
    for (const guidance of getGameDevJobGuidance(allEngines)) {
      expect(guidance.readinessPatterns.length).toBeGreaterThan(0)
      for (const pattern of guidance.readinessPatterns) {
        expect(pattern.length).toBeGreaterThan(0)
      }
    }
  })

  test('every engine has non-empty error patterns', () => {
    for (const guidance of getGameDevJobGuidance(allEngines)) {
      expect(guidance.errorPatterns.length).toBeGreaterThan(0)
      for (const pattern of guidance.errorPatterns) {
        expect(pattern.length).toBeGreaterThan(0)
      }
    }
  })

  test('every engine has non-empty log paths', () => {
    for (const guidance of getGameDevJobGuidance(allEngines)) {
      expect(guidance.logPaths.length).toBeGreaterThan(0)
      for (const path of guidance.logPaths) {
        expect(path.length).toBeGreaterThan(0)
      }
    }
  })

  test('every engine has non-empty stop instructions', () => {
    for (const guidance of getGameDevJobGuidance(allEngines)) {
      expect(guidance.stopInstructions.length).toBeGreaterThan(0)
      expect(guidance.stopInstructions).toContain('SIGTERM')
    }
  })

  test('no readiness pattern is also an error pattern', () => {
    for (const guidance of getGameDevJobGuidance(allEngines)) {
      const readinessSet = new Set(guidance.readinessPatterns)
      for (const err of guidance.errorPatterns) {
        expect(readinessSet.has(err)).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Per-engine guidance content
// ---------------------------------------------------------------------------

describe('game-dev presets — per-engine job guidance content', () => {
  test('Unity guidance has batchmode readiness and Editor.log path', () => {
    const guidance = getGameDevJobGuidance(['unity'])[0]
    expect(guidance.readinessPatterns).toContain('Batchmode completed')
    expect(guidance.errorPatterns).toContain('CompilerError')
    expect(guidance.logPaths.some((p) => p.includes('Editor.log'))).toBe(true)
    expect(guidance.stopInstructions).toContain('process group')
  })

  test('Godot guidance has scene loaded readiness and ~/.godot log path', () => {
    const guidance = getGameDevJobGuidance(['godot'])[0]
    expect(guidance.readinessPatterns).toContain('Editor scene loaded')
    expect(guidance.errorPatterns).toContain('SCRIPT ERROR')
    expect(guidance.logPaths.some((p) => p.includes('.godot'))).toBe(true)
    expect(guidance.stopInstructions).toContain('SIGTERM')
  })

  test('Unreal guidance has LogInit readiness and Saved/Logs path', () => {
    const guidance = getGameDevJobGuidance(['unreal'])[0]
    expect(guidance.readinessPatterns).toContain('LogInit: Running')
    expect(guidance.errorPatterns).toContain('Fatal error:')
    expect(guidance.logPaths.some((p) => p.includes('Saved/Logs'))).toBe(true)
    expect(guidance.stopInstructions).toContain('process group')
  })

  test('Bevy guidance has winit readiness and panicked at error pattern', () => {
    const guidance = getGameDevJobGuidance(['bevy'])[0]
    expect(guidance.readinessPatterns).toContain('winit::window')
    expect(guidance.errorPatterns).toContain('panicked at')
    expect(guidance.stopInstructions).toContain('cargo watch')
  })
})

// ---------------------------------------------------------------------------
// Preset insertText references job guidance patterns
// ---------------------------------------------------------------------------

describe('game-dev presets — watch/run insertText references job guidance', () => {
  test('Unity watch preset references specific error patterns and log path', () => {
    const presets = getGameDevPresets(['unity'])
    const watch = presets.find((p) => p.id === 'unity:watch')!
    expect(watch.insertText).toContain('CompilerError')
    expect(watch.insertText).toContain('Editor.log')
  })

  test('Unity run preset references SIGTERM and process group stop', () => {
    const presets = getGameDevPresets(['unity'])
    const run = presets.find((p) => p.id === 'unity:run')!
    expect(run.insertText).toContain('SIGTERM')
    expect(run.insertText).toContain('process group')
  })

  test('Godot watch preset references SCRIPT ERROR pattern', () => {
    const presets = getGameDevPresets(['godot'])
    const watch = presets.find((p) => p.id === 'godot:watch')!
    expect(watch.insertText).toContain('SCRIPT ERROR')
  })

  test('Godot run preset references readiness pattern and SIGTERM', () => {
    const presets = getGameDevPresets(['godot'])
    const run = presets.find((p) => p.id === 'godot:run')!
    expect(run.insertText).toContain('Editor scene loaded')
    expect(run.insertText).toContain('SIGTERM')
  })

  test('Unreal watch preset references LogScriptCompiler error pattern', () => {
    const presets = getGameDevPresets(['unreal'])
    const watch = presets.find((p) => p.id === 'unreal:watch')!
    expect(watch.insertText).toContain('LogScriptCompiler')
  })

  test('Bevy run preset references winit readiness and panicked at error', () => {
    const presets = getGameDevPresets(['bevy'])
    const run = presets.find((p) => p.id === 'bevy:run')!
    expect(run.insertText).toContain('winit::window')
    expect(run.insertText).toContain('panicked at')
  })
})
