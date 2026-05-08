import { FREEBUFF_KIMI_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    model: FREEBUFF_KIMI_MODEL_ID,
  }),
  id: 'base2-free-kimi',
  displayName: 'Buffy the Kimi Free Orchestrator',
}

export default definition
