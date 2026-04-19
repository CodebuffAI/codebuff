import type { FreebuffSessionServerResponse } from '@codebuff/common/types/freebuff-session'

export type { FreebuffSessionServerResponse }

/**
 * CLI-side session state — layers two client-only terminal states on top of
 * the server response:
 *
 *   - `superseded`: another CLI rotated our instance_id (409). Polling stops;
 *     we show a "close the other CLI" screen.
 *   - `ended`: our seat is gone but the chat surface stays mounted so any
 *     in-flight agent run can keep streaming under the server-side grace
 *     window. The user presses Enter to rejoin the waiting room.
 *
 * Server `draining` is normalized to `ended` with `instanceId` preserved —
 * the UX is identical (input hidden, Enter-to-rejoin banner), the only
 * difference is whether outgoing chat requests carry an instance id.
 */
export type FreebuffSessionResponse =
  | Exclude<FreebuffSessionServerResponse, { status: 'draining' }>
  | { status: 'superseded' }
  | {
      status: 'ended'
      /** Present during the server-side grace window (mapped from
       *  server's `draining`); absent once we pass the hard cutoff. */
      instanceId?: string
    }

export type FreebuffSessionStatus = FreebuffSessionResponse['status']
