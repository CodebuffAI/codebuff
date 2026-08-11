import { FREEBUFF_GPT_5_6_LUNA_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

/**
 * Deliberately NO `reasoningOptions`, unlike the base2-free-luna it replaces.
 *
 * An agent-declared reasoning reaches the wire as `body.reasoning`, which makes
 * the agent the authority on effort and leaves applyFreebuffReasoningDefaults
 * unable to tell a model default apart from a user's pick — so the effort
 * control silently does nothing on exactly the models people most want to tune.
 * The catalog is the single source (FreebuffModelOption.reasoningEffort /
 * .efforts) and the server fills Luna's effort in either way, so dropping it
 * changes no request except the ones where the user chose.
 *
 * Same rule the Web base3 roots follow (createWebBase3Root has no such
 * parameter at all, so nothing can re-break it there).
 */
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-luna',
  displayName: 'Buffy on GPT-5.6 Luna',
}

export default definition
