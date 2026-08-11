import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

/**
 * base3 on DeepSeek V4 Flash 07/31 — the other arm of the comparison.
 *
 * Same model, same `noAskUser`, same Freebuff branding as the shipped
 * base3-free-deepseek-flash root. The only difference from the base2 arm is the
 * harness itself, which is the whole point.
 */
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    isFreebuff: true,
    noAskUser: true,
  }),
  id: 'base3-free-deepseek-flash-evals',
  displayName: 'Buffy on DeepSeek Flash (evals)',
}

export default definition
