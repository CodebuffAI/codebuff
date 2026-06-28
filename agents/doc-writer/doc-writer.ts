import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'doc-writer',
  publisher,
  displayName: 'Doc',
  spawnerPrompt:
    'Writes or updates documentation (README, API docs, guides, code comments). Spawn when a change requires documentation updates.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What to document. Describe the feature/API/change that needs docs, the target audience (users/contributors/API consumers), and the doc file(s) to create or update.',
    },
    params: {
      type: 'object',
      properties: {
        target_doc_files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of documentation file paths to create or update. If omitted, the agent infers the right doc location from the codebase structure.',
        },
        source_files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of source files the documentation should describe. The agent will read these before writing docs.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'read_files',
    'read_outline',
    'code_search',
    'read_subtree',
    'str_replace',
    'write_file',
  ],
  spawnableAgents: [],

  systemPrompt: `You are an expert technical writer. You write clear, accurate, discoverable documentation that matches the project's existing doc style and tone. You document the public contract, not the implementation trivia. You never invent APIs or behavior — you verify against source.`,

  instructionsPrompt: `Instructions:
1. Read the source_files (or code_search for the public surface) to document the real contract. Do not invent options, flags, or behaviors that are not in the source.
2. If target_doc_files are given, read them first and update in place (prefer str_replace for targeted edits; write_file only for new docs). If not given, infer the doc location from neighboring docs (check docs/, README.md, package READMEs).
3. Match the existing doc style: heading depth, code-fence language tags, tone, and section ordering. Look at an adjacent doc file as a style reference.
4. Document the public contract: what it does, the inputs/outputs, usage examples, and gotchas. Skip internal implementation details unless the prompt asks for them.
5. For code comments, document why, not what.
6. Return a concise summary: which doc files were created/updated and the key sections added.
Do not modify source code. Do not add marketing language. Keep examples minimal and runnable.`.trim(),

  handleSteps: function* ({ params }) {
    const sourceFiles = (params?.source_files as string[] | undefined) ?? []
    if (sourceFiles.length > 0) {
      yield {
        toolName: 'read_files',
        input: { paths: sourceFiles },
      } as ToolCall<'read_files'>
    }
    const targetDocs = (params?.target_doc_files as string[] | undefined) ?? []
    if (targetDocs.length > 0) {
      yield {
        toolName: 'read_files',
        input: { paths: targetDocs },
      } as ToolCall<'read_files'>
    }
    yield 'STEP_ALL'
  },
}

export default definition