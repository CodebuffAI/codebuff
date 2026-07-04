import { CODEBIRDS_KIMI_MODEL_ID } from '@codebirds/common/constants/codebirds-models'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    model: CODEBIRDS_KIMI_MODEL_ID,
  }),
  id: 'base2-free-kimi',
  displayName: 'Buffy the Kimi Free Orchestrator',
}

export default definition
