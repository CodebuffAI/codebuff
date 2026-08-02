import { writeTerminalControlSync } from './terminal-io'

import type { TerminalCommandIsolation } from '@codebuff/sdk'
import type { CliRenderer } from '@opentui/core'

const ENABLE_FOCUS_REPORTING = '\x1b[?1004h'
const DISABLE_FOCUS_REPORTING = '\x1b[?1004l'
const FOCUS_EVENT_RE = /\x1b\[(I|O)/g
const TERMINAL_ISOLATION_RECOVERY =
  'Restart Freebuff in Windows Terminal or the VS Code terminal and try again.'

type TerminalProtocolRenderer = Pick<
  CliRenderer,
  'isDestroyed' | 'useMouse' | 'prependInputHandler' | 'removeInputHandler'
>

type FocusSubscriber = {
  onFocusChange: (focused: boolean) => void
  onSupportDetected?: () => void
}

export interface TerminalProtocolControllerOptions {
  platform?: NodeJS.Platform
  writeControl?: (sequence: string) => boolean
  onError?: (error: unknown) => void
}

/** Return the last complete focus report in a terminal input sequence. */
export function parseFocusState(data: string): boolean | null {
  if (!data.includes('\x1b[')) return null

  let focused: boolean | null = null
  FOCUS_EVENT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FOCUS_EVENT_RE.exec(data)) !== null) {
    focused = match[1] === 'I'
  }
  return focused
}

/**
 * Single owner for terminal protocols that can emit unsolicited input.
 *
 * OpenTUI owns the normal terminal setup, while this controller owns the one
 * exceptional transition: isolating the TUI from Windows command descendants
 * that can open CONIN$/CONOUT$ and bypass their stdio pipes. Isolation is a
 * nested lease, acquired synchronously before spawn and released only after the
 * command process tree exits.
 */
export class TerminalProtocolController {
  private readonly platform: NodeJS.Platform
  private readonly writeControl: (sequence: string) => boolean
  private readonly onError: (error: unknown) => void
  private readonly focusSubscribers = new Set<FocusSubscriber>()
  private isolationDepth = 0
  private restoring = false
  private restoreMouse = false
  private focusSupported = false
  private lastFocusState: boolean | null = null
  private disposed = false

  constructor(
    private readonly renderer: TerminalProtocolRenderer,
    options: TerminalProtocolControllerOptions = {},
  ) {
    this.platform = options.platform ?? process.platform
    this.writeControl = options.writeControl ?? writeTerminalControlSync
    this.onError = options.onError ?? (() => {})
    renderer.prependInputHandler(this.handleInput)
  }

  private reportError(error: unknown): void {
    try {
      this.onError(error)
    } catch {
      // Diagnostics must never turn a recoverable terminal transition into an
      // input-handler or command-lifecycle failure.
    }
  }

  private setFocusReporting(enabled: boolean, failureMessage: string): boolean {
    try {
      if (
        this.writeControl(
          enabled ? ENABLE_FOCUS_REPORTING : DISABLE_FOCUS_REPORTING,
        )
      ) {
        return true
      }
      this.reportError(new Error(failureMessage))
    } catch (error) {
      this.reportError(error)
    }
    return false
  }

  private readonly handleInput = (sequence: string): boolean => {
    const focused = parseFocusState(sequence)
    if (focused === null) return false

    if (!this.focusSupported) {
      this.focusSupported = true
      for (const subscriber of this.focusSubscribers) {
        try {
          subscriber.onSupportDetected?.()
        } catch (error) {
          this.reportError(error)
        }
      }
    }

    if (focused !== this.lastFocusState) {
      this.lastFocusState = focused
      for (const subscriber of this.focusSubscribers) {
        try {
          subscriber.onFocusChange(focused)
        } catch (error) {
          this.reportError(error)
        }
      }
    }

    // OpenTUI restores every terminal mode on the first focus-in after a
    // focus-out. Consume focus reports while isolated (including restoration)
    // so a queued report cannot turn mouse tracking back on mid-command.
    return this.isolationDepth > 0 || this.restoring
  }

  subscribeToFocus(subscriber: FocusSubscriber): () => void {
    if (this.disposed) return () => {}
    const isFirstSubscriber = this.focusSubscribers.size === 0
    this.focusSubscribers.add(subscriber)

    if (isFirstSubscriber && this.isolationDepth === 0) {
      this.setFocusReporting(true, 'Could not enable terminal focus reporting')
    }

    if (this.focusSupported) {
      try {
        subscriber.onSupportDetected?.()
        if (this.lastFocusState !== null) {
          subscriber.onFocusChange(this.lastFocusState)
        }
      } catch (error) {
        this.reportError(error)
      }
    }

    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      this.focusSubscribers.delete(subscriber)
      if (this.disposed) return
      if (this.focusSubscribers.size === 0 && this.isolationDepth === 0) {
        this.setFocusReporting(
          false,
          'Could not disable terminal focus reporting',
        )
      }
    }
  }

  acquireTerminalCommand(): () => void {
    if (this.platform !== 'win32') return () => {}
    if (this.disposed || this.renderer.isDestroyed) {
      throw new Error('the terminal renderer is no longer available')
    }

    this.isolationDepth++
    if (this.isolationDepth === 1) {
      try {
        this.restoreMouse = this.renderer.useMouse
        if (this.restoreMouse) this.renderer.useMouse = false
        if (
          !this.setFocusReporting(
            false,
            'Could not isolate terminal focus reporting',
          )
        ) {
          throw new Error(
            `Freebuff could not safely disable terminal input reports. ${TERMINAL_ISOLATION_RECOVERY}`,
          )
        }
      } catch (error) {
        this.isolationDepth = 0
        if (this.restoreMouse && !this.renderer.isDestroyed) {
          try {
            this.renderer.useMouse = true
          } catch (restoreError) {
            this.reportError(restoreError)
          }
        }
        if (this.focusSubscribers.size > 0 && !this.renderer.isDestroyed) {
          this.setFocusReporting(
            true,
            'Could not restore focus reporting after isolation failed',
          )
        }
        this.restoreMouse = false
        throw error
      }
    }

    let released = false
    return () => {
      if (released) return
      released = true
      this.releaseTerminalCommand()
    }
  }

  private releaseTerminalCommand(): void {
    if (this.isolationDepth === 0) return
    this.isolationDepth--
    if (this.isolationDepth > 0) return
    if (this.disposed || this.renderer.isDestroyed) return

    this.restoring = true
    try {
      // Restore mouse first while focus reports are still suppressed. This
      // closes the inverse race where focus-in makes OpenTUI restore all modes
      // between our two writes.
      if (this.restoreMouse) this.renderer.useMouse = true
      if (this.focusSubscribers.size > 0) {
        this.setFocusReporting(
          true,
          'Could not restore terminal focus reporting',
        )
      }
    } catch (error) {
      this.reportError(error)
    } finally {
      this.restoring = false
      this.restoreMouse = false
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.focusSubscribers.clear()
    this.renderer.removeInputHandler(this.handleInput)
    if (activeController === this) activeController = null
  }
}

let activeController: TerminalProtocolController | null = null

export function installTerminalProtocolController(
  renderer: TerminalProtocolRenderer,
  options: TerminalProtocolControllerOptions = {},
): TerminalProtocolController {
  if (activeController) {
    throw new Error('terminal protocol controller is already installed')
  }
  const controller = new TerminalProtocolController(renderer, options)
  activeController = controller
  return controller
}

/** Explicit SDK capability used by both agent tools and CLI `!` commands. */
export const terminalCommandIsolation: TerminalCommandIsolation = {
  acquire: () => {
    if (!activeController) {
      throw new Error(
        `Freebuff terminal isolation is unavailable. ${TERMINAL_ISOLATION_RECOVERY}`,
      )
    }
    return activeController.acquireTerminalCommand()
  },
}

export function getTerminalProtocolController(): TerminalProtocolController | null {
  return activeController
}
