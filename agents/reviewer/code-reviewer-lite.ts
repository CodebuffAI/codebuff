import { LITE_MODEL, publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

/**
 * The reviewer Codebuff's paid LITE mode spawns, on the same model as the
 * orchestrator. Freebuff's free modes use the provider-specific reviewers (see
 * FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL) or code-reviewer-deepseek-flash.
 */
const definition: SecretAgentDefinition = {
  id: 'code-reviewer-lite',
  publisher,
  ...createReviewer(LITE_MODEL),
}

export default definition
