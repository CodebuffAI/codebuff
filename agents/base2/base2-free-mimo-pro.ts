import { CODEBIRDS_MIMO_V25_PRO_MODEL_ID } from '@codebirds/common/constants/codebirds-models'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    model: CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
  }),
  id: 'base2-free-mimo-pro',
  displayName: 'Buffy the MiMo Pro Free Orchestrator',
}

export default definition
