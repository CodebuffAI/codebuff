import type { StreamStatus } from '../hooks/use-message-queue'

export type StatusIndicatorState =
  | { kind: 'idle' }
  | { kind: 'clipboard'; message: string }
  | { kind: 'ctrlC' }
  | { kind: 'connecting' }
  | { kind: 'reconnected' }
  | { kind: 'waiting' }
  | { kind: 'streaming' }

export type StatusIndicatorStateArgs = {
  clipboardMessage?: string | null
  streamStatus: StreamStatus
  nextCtrlCWillExit: boolean
  isConnected: boolean
  showReconnectionMessage?: boolean
}

/**
 * Determines the status indicator state based on current context.
 *
 * State priority (highest to lowest):
 * 1. nextCtrlCWillExit - User pressed Ctrl+C once, warn about exit
 * 2. reconnected - Temporary message after reconnection
 * 3. clipboardMessage - Temporary feedback for clipboard operations
 * 4. connecting - Not connected to backend
 * 5. waiting - Waiting for AI response to start
 * 6. streaming - AI is actively responding
 * 7. idle - No activity
 *
 * @param args - Context for determining indicator state
 * @returns The appropriate state indicator
 */
export const getStatusIndicatorState = ({
  clipboardMessage,
  streamStatus,
  nextCtrlCWillExit,
  isConnected,
  showReconnectionMessage,
}: StatusIndicatorStateArgs): StatusIndicatorState => {
  if (nextCtrlCWillExit) {
    return { kind: 'ctrlC' }
  }

  if (showReconnectionMessage) {
    return { kind: 'reconnected' }
  }

  if (clipboardMessage) {
    return { kind: 'clipboard', message: clipboardMessage }
  }

  if (!isConnected) {
    return { kind: 'connecting' }
  }

  if (streamStatus === 'waiting') {
    return { kind: 'waiting' }
  }

  if (streamStatus === 'streaming') {
    return { kind: 'streaming' }
  }

  return { kind: 'idle' }
}
