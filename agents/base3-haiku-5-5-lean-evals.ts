import { LEAN_COMPACTION_POLICY } from '@codebuff/common/constants/compaction-policy'

import { createBase3CliRoot } from './base3'

/**
 * `base3-haiku-5-5-evals` on LEAN_COMPACTION_POLICY, the policy of the
 * 100k-context catalog row: every request under 100k prompt tokens.
 * Everything else matches, so the pair isolates the budget.
 */
const definition = {
  ...createBase3CliRoot({
    model: 'anthropic/claude-haiku-5.5',
    isFreebuff: true,
    noAskUser: true,
    noWeb: true,
    modelLabel: 'Claude Haiku 5.5',
    compaction: LEAN_COMPACTION_POLICY,
  }),
  id: 'base3-haiku-5-5-lean-evals',
  displayName: 'Buffy on Claude Haiku 5.5, lean context (evals)',
}

export default definition
