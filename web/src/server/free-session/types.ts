export type FreeSessionStatus = 'queued' | 'active'

/** Public state returned to CLI clients. */
export type SessionStateResponse =
  | {
      status: 'disabled'
      /** Waiting room is globally off; free-mode requests flow through
       *  unchanged. Client should treat this as "admitted forever". */
    }
  | {
      status: 'queued'
      instanceId: string
      /** 1-indexed position in the FIFO queue. */
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
  | {
      /** Session is past `expiresAt` but still inside the grace window — the
       *  CLI must stop accepting new prompts but may finish any in-flight
       *  agent run. Hard cutoff at `gracePeriodEndsAt`; past that the gate
       *  rejects with `session_expired`. */
      status: 'draining'
      instanceId: string
      admittedAt: string
      expiresAt: string
      gracePeriodEndsAt: string
      gracePeriodRemainingMs: number
    }

export interface InternalSessionRow {
  user_id: string
  status: FreeSessionStatus
  active_instance_id: string
  queued_at: Date
  admitted_at: Date | null
  expires_at: Date | null
  created_at: Date
  updated_at: Date
}
