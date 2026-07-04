import { CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebirds/common/constants/codebirds-models'

import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-deepseek-flash',
  publisher,
  ...createReviewer(CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID),
}

export default definition
