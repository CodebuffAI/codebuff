import { openCodeZenModels } from '@codebuff/common/constants/model-config'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    noAskUser: true,
    model: openCodeZenModels.opencode_minimax_m2_7,
  }),
  id: 'base2-free-opencode-minimax',
  displayName: 'Buffy the MiniMax (OpenCode) Free Orchestrator',
}

export default definition
