import { FREEBUFF_MUSE_SPARK_13_CONTRIBUTOR_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

/**
 * Muse Spark 1.3 Contributor on the CLI, and by the shared root id on Desktop.
 *
 * The single-loop harness suits this row twice over: Meta meters the
 * Contributor tier per TEAM, so every subagent or reviewer pass would spend
 * requests from budgets shared with every other Freebuff user. No
 * `reasoningOptions`, like every Freebuff root — the catalog owns the ladder
 * (`xhigh` is a rung the shared AgentDefinition enum cannot express) and the
 * server fills it in, so the picker and the wire cannot drift.
 */
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_MUSE_SPARK_13_CONTRIBUTOR_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-muse-spark-1-3',
  displayName: 'Buffy on Muse Spark 1.3',
}

export default definition
