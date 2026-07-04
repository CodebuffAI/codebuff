import { CODEBIRDS_GLM_V52_MODEL_ID } from '@codebirds/common/constants/codebirds-models'

import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-glm',
  publisher,
  ...createReviewer(CODEBIRDS_GLM_V52_MODEL_ID),
}

export default definition
