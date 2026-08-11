import { createBase3CliRoot } from './base3'

/**
 * Codebuff DEFAULT (base3) as buffbench runs it.
 *
 * `noAskUser` is the only difference, and it matters: there is no human in an
 * eval, so an ask_user call would stall the run rather than gather anything.
 * The base2 evals variants (`base2-evals`, `base2-lite-evals`) exist for the
 * same reason, so a base3-vs-base2 score comparison is like-for-like.
 */
const definition = {
  ...createBase3CliRoot({ noAskUser: true }),
  id: 'base3-evals',
  displayName: 'Buffy the Evals Agent',
}

export default definition
