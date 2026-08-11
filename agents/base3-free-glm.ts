import { FREEBUFF_GLM_V52_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_GLM_V52_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-glm',
  displayName: 'Buffy on GLM 5.2',
}

export default definition
