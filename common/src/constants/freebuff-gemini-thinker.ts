export const FREEBUFF_GEMINI_THINKER_AGENT_ID = 'thinker-with-files-gemini'

export const FREEBUFF_GEMINI_THINKER_SYSTEM_INSTRUCTION =
  "Spawn the thinker-with-files-gemini agent for complex problems -- it's very smart. Skip it for routine edits and clearly-scoped changes. Pass the relevant filePaths since it has no conversation history."

export const FREEBUFF_GEMINI_THINKER_INSTRUCTIONS_PROMPT =
  '- For complex problems, spawn the thinker-with-files-gemini agent after gathering context. Skip it for routine edits and clearly-scoped changes. Pass the relevant filePaths.'

export const FREEBUFF_GEMINI_THINKER_STEP_PROMPT =
  'Spawn the thinker-with-files-gemini agent for complex problems, not routine edits. Pass the relevant filePaths.'

export const FREEBUFF_GEMINI_THINKER_PROMPT_LINES = [
  FREEBUFF_GEMINI_THINKER_SYSTEM_INSTRUCTION,
  FREEBUFF_GEMINI_THINKER_INSTRUCTIONS_PROMPT,
  FREEBUFF_GEMINI_THINKER_STEP_PROMPT,
] as const
