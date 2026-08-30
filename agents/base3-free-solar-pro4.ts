import { FREEBUFF_SOLAR_PRO_4_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_SOLAR_PRO_4_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-solar-pro4',
  displayName: 'Buffy on Solar Pro 4',
}

export default definition
