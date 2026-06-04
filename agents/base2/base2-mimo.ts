import { mimoModels } from '@codebuff/common/constants/model-config'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('default', {
    model: mimoModels.mimoV25Pro,
  }),
  id: 'base2-mimo',
  displayName: 'Buffy the MiMo Orchestrator',
}

export default definition
