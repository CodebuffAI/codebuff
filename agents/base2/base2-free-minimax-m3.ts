import { FREEBUFF_MINIMAX_M3_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    model: FREEBUFF_MINIMAX_M3_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-minimax-m3',
  displayName: 'Buffy the MiniMax M3 Free Orchestrator',
}

export default definition
