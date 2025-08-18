import { publisher } from './constants'
import { filePicker } from './factory/file-picker'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'file-picker',
  publisher,
  ...filePicker('google/gemini-2.5-flash'),
}

export default definition
