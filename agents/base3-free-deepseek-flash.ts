import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-deepseek-flash',
  displayName: 'Buffy on DeepSeek Flash',
}

export default definition
