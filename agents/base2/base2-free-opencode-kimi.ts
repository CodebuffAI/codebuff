import { openCodeZenModels } from '@codebuff/common/constants/model-config'

import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    noAskUser: true,
    model: openCodeZenModels.opencode_kimi_k2_6,
  }),
  id: 'base2-free-opencode-kimi',
  displayName: 'Buffy the Kimi (OpenCode) Free Orchestrator',
}

export default definition
