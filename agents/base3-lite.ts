import { createBase3CliRoot } from './base3'
import { LITE_MODEL } from './constants'

/**
 * Codebuff's paid LITE mode.
 *
 * base2-lite spawned a `code-reviewer-lite` and could escalate to the Gemini
 * thinker; neither survives the single-loop harness, so lite is now literally
 * the DEFAULT root on a cheaper model. That is the whole difference.
 */
const definition = {
  ...createBase3CliRoot({ model: LITE_MODEL }),
  id: 'base3-lite',
  displayName: 'Buffy Lite',
}

export default definition
