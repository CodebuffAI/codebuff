import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2/base2'

/**
 * base2 on DeepSeek V4 Flash 07/31, for the base2-vs-base3 comparison.
 *
 * `noAskUser` because an eval has no human — the same reason base2-evals sets
 * it. Nothing else differs from the shipped base2-free-deepseek-flash root, and
 * neither arm declares reasoningOptions, so the server treats both identically.
 */
const definition = {
  ...createBase2('free', {
    model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    noAskUser: true,
  }),
  id: 'base2-free-deepseek-flash-evals',
  displayName: 'Buffy the DeepSeek Flash Evals Orchestrator',
}

export default definition
