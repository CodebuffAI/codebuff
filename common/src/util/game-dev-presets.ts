import type { SupportedEngineId } from './engine-profiles'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A game-dev task preset that maps to a slash command with insertText.
 * When the user selects the slash command, the insertText is placed into
 * the input field for review before sending.
 */
export interface GameDevPreset {
  /** Slash command id, e.g. "unity:build" */
  id: string
  /** Slash command label shown in the palette */
  label: string
  /** Short description shown in the palette */
  description: string
  /** Text inserted into the input field when selected */
  insertText: string
}

/**
 * Engine-specific guidance for long-running job management.
 * Provides readiness patterns, log file locations, and stop instructions
 * that the agent uses with the existing check_job / kill_job / read_logs
 * tools for named editor/build/watch/export processes.
 */
export interface GameDevJobGuidance {
  /** Engine id this guidance applies to */
  engineId: SupportedEngineId
  /** Human-readable engine name */
  displayName: string
  /** Substrings to wait for in output that indicate the process is ready */
  readinessPatterns: string[]
  /** Substrings that indicate errors or failures in process output */
  errorPatterns: string[]
  /** Common log file paths relative to project root or user home */
  logPaths: string[]
  /** Instructions for cleanly stopping a running engine process */
  stopInstructions: string
}

// ---------------------------------------------------------------------------
// Per-engine job guidance (long-running process UX)
// ---------------------------------------------------------------------------

/**
 * Engine-specific job guidance for long-running editor/build/watch/export
 * processes. The agent uses these patterns with check_job (wait_for),
 * read_logs (log tail), and kill_job (stop instructions) to manage
 * game engine processes without blocking the turn.
 */
const ENGINE_JOB_GUIDANCE: Record<SupportedEngineId, GameDevJobGuidance> = {
  unity: {
    engineId: 'unity',
    displayName: 'Unity',
    readinessPatterns: [
      'Batchmode completed',
      'Compilation succeeded',
      'Refresh completed',
      'EditorApplication EnterPlaymode',
    ],
    errorPatterns: [
      'Compilation failed',
      'Shader error',
      'CompilerError',
      'Exception:',
      'ERROR:',
    ],
    logPaths: [
      '~/Library/Logs/Unity/Editor.log',
      '%LOCALAPPDATA%/Unity/Editor/Editor.log',
      'Library/Bee/artifacts/',
    ],
    stopInstructions:
      'Send SIGTERM to the Unity Editor or batchmode process. If it does not exit within 10 seconds, use SIGKILL. Unity batchmode processes may spawn child compilation processes — kill the entire process group to avoid orphaned compilers.',
  },
  godot: {
    engineId: 'godot',
    displayName: 'Godot',
    readinessPatterns: [
      'Editor scene loaded',
      'Scene tree initialized',
      'Running scene',
      'Export successful',
    ],
    errorPatterns: [
      'SCRIPT ERROR',
      'Parse Error',
      'ERROR:',
      'CRASH:',
    ],
    logPaths: [
      '~/.godot/editor_data/logs/',
      'logs/',
    ],
    stopInstructions:
      'Send SIGTERM to the Godot editor or headless export process. Godot exits cleanly on SIGTERM. If running headless export, the process exits on its own when the export completes — only kill if it hangs.',
  },
  unreal: {
    engineId: 'unreal',
    displayName: 'Unreal Engine',
    readinessPatterns: [
      'LogInit: Running',
      'LogInit: Display: Running Engine',
      'Bound to port',
      'UBT: Building',
      'Build succeeded',
    ],
    errorPatterns: [
      'LogScriptCompiler: Error',
      'LogWindows: Error',
      'Fatal error:',
      'LogInit: Error',
      'UBT: Error',
    ],
    logPaths: [
      'Saved/Logs/',
      'Saved/Logs/<project>.log',
      '~/Library/Logs/Unreal Engine/',
    ],
    stopInstructions:
      'Send SIGTERM to the UnrealEditor or UBT process. Unreal builds can take a long time — only kill if truly stuck. If the build process spawned child compilation tasks, kill the process group to avoid orphaned compilers.',
  },
  bevy: {
    engineId: 'bevy',
    displayName: 'Bevy',
    readinessPatterns: [
      'winit::window',
      'AdapterInfo',
      'Successfully initialized',
      'Finished',
    ],
    errorPatterns: [
      'panicked at',
      'error[E',
      'thread main panicked',
      'FAILED',
    ],
    logPaths: [
      'logs/',
    ],
    stopInstructions:
      'Send SIGTERM to the cargo run or cargo watch process. Rust processes exit cleanly on SIGTERM. If cargo watch is running, kill it with kill_job before rebuilding to avoid stale recompile loops.',
  },
}

// ---------------------------------------------------------------------------
// Per-engine task presets
// ---------------------------------------------------------------------------

/**
 * Task presets per engine. Each engine has build, run, test, and watch
 * presets that generate prompts the agent can act on using the existing
 * run_terminal_command / check_job / kill_job tools.
 *
 * Presets are prompts, NOT direct commands — the agent receives the prompt,
 * inspects the project to find the correct build system and commands, and
 * runs them with the user's confirmation. This avoids hardcoding commands
 * that may not match the project's actual setup.
 */
const ENGINE_PRESETS: Record<
  SupportedEngineId,
  GameDevPreset[]
> = {
  unity: [
    {
      id: 'unity:build',
      label: 'unity:build',
      description: 'Build the Unity project for the default platform',
      insertText:
        'Build the Unity project. First check ProjectSettings/ProjectVersion.txt for the Unity version, look for any build scripts or CI configs, then run the appropriate build command (e.g. Unity CLI batchmode or a custom build script). Use a synchronous terminal command for the build and report any errors.',
    },
    {
      id: 'unity:run',
      label: 'unity:run',
      description: 'Open or run the Unity project in the editor',
      insertText:
        'Open this Unity project. Check ProjectSettings/ProjectVersion.txt for the Unity version and suggest the command to launch the Unity Editor with this project. If the editor is already running, use check_job to poll it — wait for "Refresh completed" or "EditorApplication" readiness patterns. To stop a running Unity process, send SIGTERM (kill_job) and if it does not exit within 10 seconds, escalate to SIGKILL — Unity may spawn child compilation processes, so kill the process group to avoid orphans.',
    },
    {
      id: 'unity:test',
      label: 'unity:test',
      description: 'Run Unity Test Runner (EditMode/PlayMode tests)',
      insertText:
        'Run the Unity test suite. Look for test assemblies (*.Tests.asmdef) and run Unity Test Runner via CLI batchmode. Use a synchronous terminal command and parse the test results summary.',
    },
    {
      id: 'unity:watch',
      label: 'unity:watch',
      description: 'Watch Unity console logs or build output',
      insertText:
        'Watch the Unity Editor log for errors and warnings. Find the Editor.log (macOS: ~/Library/Logs/Unity/Editor.log, Windows: %LOCALAPPDATA%/Unity/Editor/Editor.log) and start a BACKGROUND `tail -f` on it. Use check_job with a wait_for pattern for "Compilation failed|CompilerError|ERROR:" to catch build errors, or "Exception:" for runtime errors. To stop the tail, use kill_job with SIGTERM.',
    },
  ],
  godot: [
    {
      id: 'godot:build',
      label: 'godot:build',
      description: 'Export the Godot project (headless export preset)',
      insertText:
        'Export the Godot project. Check project.godot for the Godot version and export_presets.cfg for export targets. Run the Godot headless export command (`godot --headless --export-release <preset>`). Use a synchronous terminal command and report the export result.',
    },
    {
      id: 'godot:run',
      label: 'godot:run',
      description: 'Launch the Godot project in the editor or as game',
      insertText:
        'Run the Godot project. Check project.godot for the version and suggest the command to launch `godot --path .` or `godot -e` for the editor. If the editor or game process is already running as a BACKGROUND job, use check_job with wait_for for "Editor scene loaded" or "Running scene" readiness patterns. To stop the process, send SIGTERM via kill_job — Godot exits cleanly on SIGTERM.',
    },
    {
      id: 'godot:test',
      label: 'godot:test',
      description: 'Run GUT (Godot Unit Test) or integration tests',
      insertText:
        'Run the Godot test suite. Look for GUT (Godot Unit Test) addon in addons/gut or a test/ directory. Run tests via `godot --headless -s` with the test script or GUT\'s command-line interface. Use a synchronous terminal command and report results.',
    },
    {
      id: 'godot:watch',
      label: 'godot:watch',
      description: 'Watch Godot log output for errors',
      insertText:
        'Watch the Godot log for errors. Locate the Godot log file (typically `~/.godot/editor_data/logs/` or a `logs/` directory in the project) and start a BACKGROUND `tail -f`. Use check_job with a wait_for pattern for "SCRIPT ERROR|Parse Error|ERROR:|CRASH:" to catch runtime/script errors. To stop the tail, use kill_job with SIGTERM.',
    },
  ],
  unreal: [
    {
      id: 'unreal:build',
      label: 'unreal:build',
      description: 'Build the Unreal project (UBT/UnrealBuildTool)',
      insertText:
        'Build the Unreal project. Check the .uproject file for modules and engine version. Run UnrealBuildTool via the UBT command or the project\'s Build.sh/Build.bat. Use a synchronous terminal command — Unreal builds are long, so set timeout accordingly.',
    },
    {
      id: 'unreal:run',
      label: 'unreal:run',
      description: 'Launch the Unreal Editor or standalone game',
      insertText:
        'Run the Unreal Editor with this project. Suggest the `UnrealEditor <project>.uproject` command. If the editor or a cooked game build is already running as a BACKGROUND job, use check_job with wait_for for "LogInit: Running" or "Bound to port" readiness patterns. To stop the process, send SIGTERM via kill_job — Unreal builds spawn child compilation tasks, so kill the process group to avoid orphaned compilers. Only SIGKILL if truly stuck.',
    },
    {
      id: 'unreal:test',
      label: 'unreal:test',
      description: 'Run Unreal automation tests',
      insertText:
        'Run Unreal automation tests. Use `UnrealEditor <project>.uproject -ExecCmds="Automation RunTests; Quit"` or the project\'s test script. Use a synchronous terminal command for the test run.',
    },
    {
      id: 'unreal:watch',
      label: 'unreal:watch',
      description: 'Watch Unreal output log for errors/warnings',
      insertText:
        'Watch the Unreal Engine output log for errors and warnings. Find the log (typically `Saved/Logs/<project>.log` or `~/Library/Logs/Unreal Engine/`) and start a BACKGROUND `tail -f`. Use check_job with a wait_for pattern for "LogScriptCompiler: Error|Fatal error:|LogInit: Error|UBT: Error" to catch build/runtime issues. To stop the tail, use kill_job with SIGTERM.',
    },
  ],
  bevy: [
    {
      id: 'bevy:build',
      label: 'bevy:build',
      description: 'Build the Bevy project (cargo build)',
      insertText:
        'Build the Bevy project. Run `cargo build` from the project root. Use a synchronous terminal command and report any compilation errors with file locations.',
    },
    {
      id: 'bevy:run',
      label: 'bevy:run',
      description: 'Run the Bevy app (cargo run)',
      insertText:
        'Run the Bevy app with `cargo run`. Since Bevy apps open a window and run continuously, use a BACKGROUND terminal command and monitor with check_job — wait for "winit::window" or "AdapterInfo" readiness patterns, or watch for "panicked at" or "error[E" crash patterns. To stop the app, send SIGTERM via kill_job — Rust processes exit cleanly on SIGTERM.',
    },
    {
      id: 'bevy:test',
      label: 'bevy:test',
      description: 'Run cargo tests for the Bevy project',
      insertText:
        'Run the Bevy project test suite with `cargo test`. Use a synchronous terminal command and parse test results. If tests require a display, suggest `cargo test -- --nocapture` or headless display options.',
    },
    {
      id: 'bevy:watch',
      label: 'bevy:watch',
      description: 'Watch cargo build output or Bevy tracing logs',
      insertText:
        'Watch for Bevy build and runtime changes. Run `cargo watch` (if cargo-watch is installed) or `bacon` as a BACKGROUND job to get live recompilation on file changes. Use check_job with a wait_for pattern for "error[E" or "FAILED" to catch compilation errors. To stop the watcher, use kill_job with SIGTERM. Kill cargo watch before rebuilding to avoid stale recompile loops.',
    },
  ],
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all game-dev task presets for a set of detected engine profiles.
 * Returns presets for every detected engine, ordered consistently:
 * build, run, test, watch per engine, in stable engine order.
 *
 * @param engineIds - Array of detected engine IDs from detectEngineProfiles()
 * @returns Array of GameDevPreset objects suitable for slash commands
 */
export function getGameDevPresets(
  engineIds: SupportedEngineId[],
): GameDevPreset[] {
  const presets: GameDevPreset[] = []
  for (const engineId of engineIds) {
    const enginePresets = ENGINE_PRESETS[engineId]
    if (enginePresets) {
      presets.push(...enginePresets)
    }
  }
  return presets
}

/**
 * Get job guidance (readiness patterns, error patterns, log paths, stop
 * instructions) for a set of detected engine profiles. The agent uses these
 * patterns with check_job wait_for, read_logs log tail, and kill_job stop
 * to manage long-running editor/build/watch/export processes.
 *
 * @param engineIds - Array of detected engine IDs from detectEngineProfiles()
 * @returns Array of GameDevJobGuidance objects, one per detected engine
 */
export function getGameDevJobGuidance(
  engineIds: SupportedEngineId[],
): GameDevJobGuidance[] {
  return engineIds
    .map((id) => ENGINE_JOB_GUIDANCE[id])
    .filter((g): g is GameDevJobGuidance => g !== undefined)
}

/**
 * Convert game-dev presets to slash command format.
 * Each preset becomes a SlashCommand-shaped object with insertText.
 * (We return a compatible shape but keep the type definition in the CLI
 * to avoid a circular dependency from common/ -> cli/.)
 */
export function getGameDevSlashCommands(
  engineIds: SupportedEngineId[],
): Array<{
  id: string
  label: string
  description: string
  insertText: string
}> {
  return getGameDevPresets(engineIds)
}
