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
- Reviewer snapshot/file-attestation mismatches are protocol failures, not source findings; do not edit files for them. Report the finding as unresolved so the parent can retry or explicitly bypass the reviewer gate.
- Return which finding IDs were addressed and which remain unresolved.`,
}

export default definition
