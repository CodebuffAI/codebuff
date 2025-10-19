import type { AgentDefinition } from './types/agent-definition'
import validator from './validator'

const defintion: AgentDefinition = {
  ...validator,
  id: 'validator-gpt-5',
  displayName: 'Validator GPT-5',
  model: 'openai/gpt-5',
  stepPrompt: `Important: you *must* make at least one tool call in every response message unless you are done validating.`,
}

export default defintion
