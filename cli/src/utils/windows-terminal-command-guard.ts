import { runTerminalCommand } from '@codebuff/sdk'

import { writeTerminalControlSync } from './terminal-io'

import type { CliRenderer } from '@opentui/core'

const ENABLE_FOCUS_REPORTING = '\x1b[?1004h'
const DISABLE_FOCUS_REPORTING = '\x1b[?1004l'
const FOCUS_IN = '\x1b[I'
const FOCUS_OUT = '\x1b[O'

type TerminalProtocolRenderer = Pick<
  CliRenderer,
  'isDestroyed' | 'useMouse' | 'prependInputHandler' | 'removeInputHandler'
>

export interface WindowsTerminalCommandGuardOptions {
  platform?: NodeJS.Platform
  subscribe?: (listener: (active: boolean) => void) => () => void
  writeControl?: (sequence: string) => void
}

/**
 * Prevent Windows console-attached command descendants from receiving the
 * TUI's unsolicited mouse/focus reports. Such descendants can bypass their
 * stdio pipes by opening CONIN$/CONOUT$ and then paint reports like
 * `^[[<35;187;32M` directly over the alternate screen.
 *
 * Rendering and keyboard input remain live. Mouse/focus reporting is restored
 * only after the last overlapping terminal command exits.
 */
export function installWindowsTerminalCommandGuard(
  renderer: TerminalProtocolRenderer,
  options: WindowsTerminalCommandGuardOptions = {},
): () => void {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return () => {}

  const subscribe = options.subscribe ?? runTerminalCommand.subscribeToState
  const writeControl =
    options.writeControl ??
    ((sequence: string) => {
      if (!writeTerminalControlSync(sequence)) process.stdout.write(sequence)
    })

  let guarding = false
  let restoreMouse = false

  // OpenTUI restores every terminal mode when it sees focus-in after focus-out.
  // Consume focus events from its parser while guarded so a report already
  // queued before focus reporting was disabled cannot re-enable mouse mode.
  // The app's independent raw-stdin focus listener still receives the event.
  const suppressOpenTuiFocusRestore = (sequence: string) =>
    guarding && (sequence === FOCUS_IN || sequence === FOCUS_OUT)
  renderer.prependInputHandler(suppressOpenTuiFocusRestore)

  const setFocusReporting = (enabled: boolean) => {
    try {
      writeControl(enabled ? ENABLE_FOCUS_REPORTING : DISABLE_FOCUS_REPORTING)
    } catch {
      // Best effort: OpenTUI's mouse toggle still removes the high-volume
      // reports even if the controlling terminal is already closing.
    }
  }

  const restore = () => {
    if (!guarding) return
    guarding = false
    if (renderer.isDestroyed) return

    setFocusReporting(true)
    if (restoreMouse) {
      try {
        renderer.useMouse = true
      } catch {
        // Renderer teardown may race a command's close event.
      }
    }
  }

  const unsubscribe = subscribe((active) => {
    if (active) {
      if (guarding || renderer.isDestroyed) return
      guarding = true
      restoreMouse = renderer.useMouse
      if (restoreMouse) {
        try {
          renderer.useMouse = false
        } catch {
          // Continue disabling focus reporting even if renderer teardown raced.
        }
      }
      setFocusReporting(false)
      return
    }

    restore()
  })

  return () => {
    unsubscribe()
    renderer.removeInputHandler(suppressOpenTuiFocusRestore)
    restore()
  }
}
