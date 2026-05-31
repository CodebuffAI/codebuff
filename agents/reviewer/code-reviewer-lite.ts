import { deepseekModels } from '@codebuff/common/constants/model-config'

import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-lite',
  publisher,
  ...createReviewer(deepseekModels.deepseekV4Flash),
}

export default definition
