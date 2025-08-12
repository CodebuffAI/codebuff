import { publisher } from './constants'

import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'file-picker',
  publisher,
  model: 'gemini-2.5-flash-preview-05-20',
  displayName: 'Fletcher the File Fetcher',
  includeMessageHistory: false,

  toolNames: ['find_files'],

  inputSchema: {
    prompt: {
      description: 'A coding task to complete',
      type: 'string',
    },
  },
  outputMode: 'last_message',

  parentPrompt: 'Expert at finding relevant files in a codebase.',
  systemPrompt: `# Persona: {CODEBUFF_AGENT_NAME}

You are an expert at finding relevant files in a codebase.

{CODEBUFF_FILE_TREE_PROMPT}

{CODEBUFF_SYSTEM_INFO_PROMPT}

{CODEBUFF_GIT_CHANGES_PROMPT}`,
  instructionsPrompt: `Provide a very concise analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give an analysis that includes the full paths of files that are relevant and (very briefly) how they could be useful.`,
  stepPrompt:
    'Do not use the find_files tool or any tools again. Just give your response.',
  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'find_files',
      args: { prompt: prompt ?? '' },
    }
    yield 'STEP_ALL'
  },
}

export default config
