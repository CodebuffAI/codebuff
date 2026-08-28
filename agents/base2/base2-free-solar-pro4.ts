import { FREEBUFF_SOLAR_PRO_4_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    model: FREEBUFF_SOLAR_PRO_4_MODEL_ID,
  }),
  id: 'base2-free-solar-pro4',
  displayName: 'Buffy the Solar Pro 4 Free Orchestrator',
}

export default definition
