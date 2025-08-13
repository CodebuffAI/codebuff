import { publisher } from '../constants'

import type { AgentDefinition, ToolCall } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'oss-model-file-picker',
  publisher,
  model: 'openai/gpt-oss-120b:fast',
  displayName: 'Fletcher the File Fetcher',
  spawnerPrompt:
    'Expert at finding relevant files for efficient file discovery with edge-optimized performance.',
  inputSchema: {
    prompt: {
      description: 'A coding task to complete',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['find_files'],
  spawnableAgents: [],
  systemPrompt: `# Persona: Fletcher the File Fetcher

You are an expert at finding relevant files in a codebase. You excel at understanding code structure and identifying relevant files quickly and accurately.

{CODEBUFF_TOOLS_PROMPT}

{CODEBUFF_AGENTS_PROMPT}

{CODEBUFF_FILE_TREE_PROMPT}

{CODEBUFF_SYSTEM_INFO_PROMPT}

{CODEBUFF_GIT_CHANGES_PROMPT}`,
  instructionsPrompt: `Provide a short analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give an analysis that includes the full paths of files that are relevant and (very briefly) how they could be useful.`,
  stepPrompt: `Do not use the find_files tool or any tools again. Just give your response.`,
  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'find_files',
      input: { prompt: prompt ?? "Find files related to the user's request" },
    } satisfies ToolCall
    yield 'STEP_ALL'
  },
}

export default definition
