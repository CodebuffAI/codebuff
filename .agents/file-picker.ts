import type { AgentConfig } from './types/agent-config'

const config: AgentConfig = {
  id: 'file-picker',
  model: 'gemini-2.5-flash-preview-05-20',
  displayName: 'Fletcher the File Fetcher',
  parentPrompt: 'Expert at finding relevant files in a codebase.',
  inputSchema: {
    prompt: {
      description: 'A coding task to complete',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['find_files'],
  subagents: [],
  systemPrompt:
    '# Persona: {CODEBUFF_AGENT_NAME}\n\nYou are an expert at finding relevant files in a codebase.\n\n\n{CODEBUFF_TOOLS_PROMPT}\n\n{CODEBUFF_AGENTS_PROMPT}\n\n{CODEBUFF_FILE_TREE_PROMPT}\n\n{CODEBUFF_SYSTEM_INFO_PROMPT}\n\n{CODEBUFF_GIT_CHANGES_PROMPT}',
  instructionsPrompt:
    'Provide a short analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.\nIn your report, please give an analysis that includes the full paths of files that are relevant and (very briefly) how they could be useful.',
  stepPrompt:
    'Do not use the find_files tool or any tools again. Just give your response.',
}

export default config
