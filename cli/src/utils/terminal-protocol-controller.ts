import { writeTerminalControlSync } from './terminal-io'

import type { CliRenderer } from '@opentui/core'

const ENABLE_FOCUS_REPORTING = '\x1b[?1004h'
const DISABLE_FOCUS_REPORTING = '\x1b[?1004l'
const FOCUS_EVENT_RE = /\x1b\[(I|O)/g
type TerminalProtocolRenderer = Pick<
  CliRenderer,
  'prependInputHandler' | 'removeInputHandler'
>

type FocusSubscriber = {
  onFocusChange: (focused: boolean) => void
  onSupportDetected?: () => void
}

export interface TerminalProtocolControllerOptions {
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
 * OpenTUI owns normal rendering and mouse input. This controller only enables,
 * parses, and disables focus reports for subscribers.
 */
export class TerminalProtocolController {
  private readonly writeControl: (sequence: string) => boolean
  private readonly onError: (error: unknown) => void
  private readonly focusSubscribers = new Set<FocusSubscriber>()
  private focusSupported = false
  private lastFocusState: boolean | null = null
  private disposed = false

  constructor(
    private readonly renderer: TerminalProtocolRenderer,
    options: TerminalProtocolControllerOptions = {},
  ) {
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

    return false
  }

  subscribeToFocus(subscriber: FocusSubscriber): () => void {
    if (this.disposed) return () => {}
    const isFirstSubscriber = this.focusSubscribers.size === 0
    this.focusSubscribers.add(subscriber)

    if (isFirstSubscriber) {
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
      if (this.focusSubscribers.size === 0) {
        this.setFocusReporting(
          false,
          'Could not disable terminal focus reporting',
        )
      }
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

export function getTerminalProtocolController(): TerminalProtocolController | null {
  return activeController
}
