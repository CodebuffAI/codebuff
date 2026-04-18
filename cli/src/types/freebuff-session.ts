/**
 * Public shapes returned by the server at /api/v1/freebuff/session.
 * Mirrors web/src/server/free-session/types.ts but duplicated here so the CLI
 * doesn't need a cross-package import for a 20-line type.
 */
export type FreebuffSessionServerResponse =
  | { status: 'disabled' }
  | { status: 'none'; message?: string }
  | {
      status: 'queued'
      instanceId: string
      position: number
      queueDepth: number
      estimatedWaitMs: number
      queuedAt: string
    }
  | {
      status: 'active'
      instanceId: string
      admittedAt: string
      expiresAt: string
      remainingMs: number
    }

/**
 * Client-only terminal state set when the server reports `session_superseded`
 * on a chat request. Polling stops; UI tells the user to close the other CLI.
 */
export type FreebuffSessionResponse =
  | FreebuffSessionServerResponse
  | { status: 'superseded' }

export type FreebuffSessionStatus = FreebuffSessionResponse['status']
