import { FREEBUFF_MIMO_V25_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_MIMO_V25_MODEL_ID,
    // The model's own name: the compatibility id still says 2.5, and the
    // picker's "MiMo v2.6 Flash Fast" is a product label, not what is serving.
    modelLabel: 'MiMo 2.6 Flash',
    isFreebuff: true,
  }),
  id: 'base3-free-mimo',
  displayName: 'Buffy on MiMo',
}

export default definition
