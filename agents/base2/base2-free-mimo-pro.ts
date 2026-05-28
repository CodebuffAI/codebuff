import { FREEBUFF_MIMO_V25_PRO_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    model: FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  }),
  id: 'base2-free-mimo-pro',
  displayName: 'Buffy the MiMo Pro Free Orchestrator',
}

export default definition
