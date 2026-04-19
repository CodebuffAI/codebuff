/**
 * Re-export of the wire-level session shape. The CLI no longer layers any
 * client-only states on top — `ended` and `superseded` come straight from
 * the server now (see `common/src/types/freebuff-session.ts`).
 */
export type {
  FreebuffSessionServerResponse,
  FreebuffSessionServerResponse as FreebuffSessionResponse,
} from '@codebuff/common/types/freebuff-session'

import type { FreebuffSessionServerResponse } from '@codebuff/common/types/freebuff-session'

export type FreebuffSessionStatus = FreebuffSessionServerResponse['status']
