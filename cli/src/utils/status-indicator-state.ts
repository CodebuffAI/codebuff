import type { StreamStatus } from '../hooks/use-message-queue'

export type StatusIndicatorState =
  | { kind: 'idle' }
  | { kind: 'clipboard'; message: string }
  | { kind: 'ctrlC' }
  | { kind: 'connecting' }
  | { kind: 'waiting' }
  | { kind: 'streaming' }

export type StatusIndicatorStateArgs = {
  clipboardMessage?: string | null
  streamStatus: StreamStatus
  nextCtrlCWillExit: boolean
  isConnected: boolean
}

/**
 * Determines the status indicator state based on current context.
 * 
 * State priority (highest to lowest):
 * 1. nextCtrlCWillExit - User pressed Ctrl+C once, warn about exit
 * 2. clipboardMessage - Temporary feedback for clipboard operations
 * 3. connecting - Not connected to backend
 * 4. waiting - Waiting for AI response to start
 * 5. streaming - AI is actively responding
 * 6. idle - No activity
 * 
 * @param args - Context for determining indicator state
 * @returns The appropriate state indicator
 */
export const getStatusIndicatorState = ({
  clipboardMessage,
  streamStatus,
  nextCtrlCWillExit,
  isConnected,
}: StatusIndicatorStateArgs): StatusIndicatorState => {
  if (nextCtrlCWillExit) {
    return { kind: 'ctrlC' }
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
