import { publisher } from '../constants'
import { filePicker } from 'factory/file-picker'
import { SecretAgentDefinition } from 'types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...filePicker('x-ai/grok-4-fast'),
  id: 'researcher-file-picker',
  publisher,
}

export default definition
