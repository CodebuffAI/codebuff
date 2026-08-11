import { FREEBUFF_MINIMAX_M3_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_MINIMAX_M3_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-minimax-m3',
  displayName: 'Buffy on MiniMax M3',
}

export default definition
