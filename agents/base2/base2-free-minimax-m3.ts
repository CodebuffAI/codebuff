import { CODEBIRDS_MINIMAX_M3_MODEL_ID } from '@codebirds/common/constants/codebirds-models'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    model: CODEBIRDS_MINIMAX_M3_MODEL_ID,
  }),
  id: 'base2-free-minimax-m3',
  displayName: 'Buffy the MiniMax M3 Free Orchestrator',
}

export default definition
