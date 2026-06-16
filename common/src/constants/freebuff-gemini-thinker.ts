export const FREEBUFF_GEMINI_THINKER_AGENT_ID = 'thinker-with-files-gemini'

export const FREEBUFF_GEMINI_THINKER_SYSTEM_INSTRUCTION =
  "Spawn the thinker-with-files-gemini agent to think through problems worth reasoning about -- it's very smart. Reach for it on non-trivial bugs, uncertain approaches, and tricky decisions, not just the hardest tasks. Skip it for routine, clearly-scoped edits. Pass the relevant filePaths since it has no conversation history."

export const FREEBUFF_GEMINI_THINKER_INSTRUCTIONS_PROMPT =
  '- For problems worth thinking through -- non-trivial bugs, uncertain approaches, or tricky decisions -- spawn the thinker-with-files-gemini agent after gathering context, not just for the hardest tasks. Skip it for routine, clearly-scoped edits. Pass the relevant filePaths.'

export const FREEBUFF_GEMINI_THINKER_STEP_PROMPT =
  'For non-trivial problems or decisions, spawn the thinker-with-files-gemini agent to think it through. Skip it for routine edits. Pass the relevant filePaths.'

export const FREEBUFF_GEMINI_THINKER_PROMPT_LINES = [
  FREEBUFF_GEMINI_THINKER_SYSTEM_INSTRUCTION,
  FREEBUFF_GEMINI_THINKER_INSTRUCTIONS_PROMPT,
  FREEBUFF_GEMINI_THINKER_STEP_PROMPT,
] as const
