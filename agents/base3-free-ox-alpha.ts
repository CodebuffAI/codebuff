import { FREEBUFF_OX_ALPHA_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

/**
 * Buffy on Ox Alpha, for CLI and Desktop (2026-08-24).
 *
 * No `reasoningOptions`, for the reason spelled out on base3-free-luna: an
 * agent-declared reasoning reaches the wire as `body.reasoning` and makes the
 * agent the authority on effort, which leaves the user's picker choice unable
 * to do anything. That matters more here than on most rows -- this endpoint
 * reports `reasoning.mandatory: true` with `default_effort: max`, and `max`
 * costs ~4.8x the tokens of `high` for no better answer while being the rung
 * most likely to spend the whole budget thinking and return
 * `finish_reason: "length"` with null content. The catalog row names `high`
 * explicitly and the server fills it in; hard-coding anything here would take
 * that away.
 */
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_OX_ALPHA_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-ox-alpha',
  displayName: 'Buffy on Ox Alpha',
}

export default definition
