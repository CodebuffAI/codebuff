import { FREEBUFF_GEMINI_38_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

/**
 * Gemini 3.8 Flash on the CLI (and, by the shared root id, the Desktop).
 *
 * No `reasoningOptions`, like every Freebuff root: the catalog owns the ladder
 * and the server fills the effort in, so the picker and the wire cannot drift.
 * That is worth more on this row than most — reasoning bills as output at
 * $1.875/M here, so the effort control is a cost lever rather than a latency
 * one (see FREEBUFF_GEMINI_38_FLASH_MODEL_ID).
 */
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_GEMINI_38_FLASH_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-gemini-3-8-flash',
  displayName: 'Buffy on Gemini 3.8 Flash',
}

export default definition
