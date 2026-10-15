import { GEMINI_4_ARGON_COMPACTION_POLICY } from '@codebuff/common/constants/compaction-policy'
import { FREEBUFF_GEMINI_4_ARGON_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

/**
 * Gemini 4 Argon on the CLI (and, by the shared root id, the Desktop). A
 * paid-only row outside the US (FREEBUFF_PRO_ONLY_EVERY_SURFACE_MODEL_IDS);
 * admission is the gate.
 *
 * No `reasoningOptions`, like every base3 root: the catalog owns the ladder and
 * the server fills the effort in, so the picker and the wire cannot drift.
 */
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_GEMINI_4_ARGON_MODEL_ID,
    isFreebuff: true,
    // Every request under 100k (GEMINI_4_ARGON_COMPACTION_POLICY).
    compaction: GEMINI_4_ARGON_COMPACTION_POLICY,
  }),
  id: 'base3-free-gemini-4-argon',
  displayName: 'Buffy on Gemini 4 Argon',
}

export default definition
