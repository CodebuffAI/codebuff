import { FREEBUFF_SOLAR_PRO_4_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-solar-pro4',
  publisher,
  ...createReviewer(FREEBUFF_SOLAR_PRO_4_MODEL_ID),
}

export default definition
