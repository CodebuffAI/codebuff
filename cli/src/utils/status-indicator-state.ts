import type { StreamStatus } from '../hooks/use-message-queue'

export type StatusIndicatorState =
  | { kind: 'idle' }
  | { kind: 'clipboard'; message: string }
  | { kind: 'ctrlC' }
  | { kind: 'connecting' }
  | { kind: 'retrying' }
  | { kind: 'waiting' }
  | { kind: 'streaming' }
  | { kind: 'reconnected' }

export type AuthStatus = 'ok' | 'retrying' | 'unreachable'

export type StatusIndicatorStateArgs = {
  statusMessage?: string | null
  streamStatus: StreamStatus
  nextCtrlCWillExit: boolean
  isConnected: boolean
  authStatus?: AuthStatus
  isRetrying?: boolean
  /**
   * Whether to show a transient "Reconnected" status message.
   * This should only be true for a short period after a reconnection event.
   */
  showReconnectionMessage?: boolean
  /**
   * Whether the ask_user tool is currently active (waiting for user input).
   * When true, hides the "working..." and "thinking..." indicators.
   */
  isAskUserActive?: boolean
}

/**
 * Determines the status indicator state based on current context.
 *
 * State priority (highest to lowest):
 * 1. nextCtrlCWillExit - User pressed Ctrl+C once, warn about exit
 * 2. statusMessage - Temporary feedback for clipboard operations
 * 3. connecting - Not connected to backend
 * 4. waiting - Waiting for AI response to start
 * 5. streaming - AI is actively responding
 * 6. idle - No activity
 *
 * @param args - Context for determining indicator state
 * @returns The appropriate state indicator
 */
export const getStatusIndicatorState = ({
  statusMessage,
  streamStatus,
  nextCtrlCWillExit,
  isConnected,
  authStatus = 'ok',
  isRetrying = false,
  showReconnectionMessage = false,
  isAskUserActive = false,
}: StatusIndicatorStateArgs): StatusIndicatorState => {
  if (nextCtrlCWillExit) {
    return { kind: 'ctrlC' }
  }

  if (statusMessage) {
    return { kind: 'clipboard', message: statusMessage }
  }

  // Transient reconnection indicator takes precedence over other status
  if (showReconnectionMessage) {
    return { kind: 'reconnected' }
  }

  // If we're online but the auth request hit a retryable error and is auto-retrying,
  // surface that explicitly to the user.
  if (authStatus === 'retrying') {
    return { kind: 'retrying' }
  }
  if (isRetrying) {
    return { kind: 'retrying' }
  }

  // Show connecting if service is disconnected OR auth service is unreachable
  if (!isConnected || authStatus === 'unreachable') {
    return { kind: 'connecting' }
  }

  // Hide working/thinking indicators when ask_user is active
  if (isAskUserActive) {
    return { kind: 'idle' }
  }

  if (streamStatus === 'waiting') {
    return { kind: 'waiting' }
  }

  if (streamStatus === 'streaming') {
    return { kind: 'streaming' }
  }

  return { kind: 'idle' }
}
