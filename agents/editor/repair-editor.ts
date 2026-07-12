import { createCodeEditor } from './editor'

import type { AgentDefinition } from '../types/agent-definition'

const base = createCodeEditor({ model: 'opus' })

const definition: AgentDefinition = {
  ...base,
  id: 'repair-editor',
  displayName: 'Repair Editor',
  spawnerPrompt:
    'Repairs exact validation diagnostics or stable reviewer finding IDs. May only make finding-scoped edits and must not perform unrelated cleanup.',
  instructionsPrompt: `${base.instructionsPrompt}

Repair specialization:
- The spawn prompt must name exact validation diagnostics or stable reviewer finding IDs.
- Every edit must map to at least one supplied finding/diagnostic.
- Edit only implicated files and the narrowest directly required tests.
- Do not perform unrelated cleanup, refactors, documentation, or feature work.
- Return which finding IDs were addressed and which remain unresolved.`,
}

export default definition
