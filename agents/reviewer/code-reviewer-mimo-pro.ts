import { CODEBIRDS_MIMO_V25_PRO_MODEL_ID } from '@codebirds/common/constants/codebirds-models'

import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-mimo-pro',
  publisher,
  ...createReviewer(CODEBIRDS_MIMO_V25_PRO_MODEL_ID),
}

export default definition
