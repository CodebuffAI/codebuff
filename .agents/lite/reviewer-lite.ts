import { reviewer } from 'factory/reviewer'
import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...reviewer('openai/gpt-5-chat'),
  id: 'reviewer-lite',
  publisher,
}

export default definition
