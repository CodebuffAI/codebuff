/**
 * base3's rule for when a turn ends: the runtime ends it on any step without a
 * tool call (docs/freebuff-muse-spark.md). Shared with the server's Muse Spark
 * stopgap, which skips any prompt that already contains this exact text.
 */
export const TURN_ENDING_RULE =
  'A message without a tool call ends your turn: nothing runs after it, and ' +
  'nothing you write is queued for later. When you say what you will do next ' +
  '("let me check the config", "running the tests now"), make that tool call ' +
  'in the same message rather than ending on the plan. End your turn only ' +
  'when the task is done, the question is answered, or you need the user’s ' +
  'input.'

/**
 * base3's `instructionsPrompt` on Muse Spark 1.3: the rule again, right after
 * every user message. The position does the work: in the system prompt the
 * rule did not stop Muse ending a turn on a status line; here it did
 * (docs/freebuff-muse-spark.md). The `<system>` tags mark it as harness text,
 * which the prompt classifier skips.
 */
export const TURN_ENDING_NOTE =
  '<system>Do not reply with a status line or an announcement of your next ' +
  'step. If the message above needs work, your response must call the tools ' +
  'that do it; a response without a tool call ends your turn and nothing ' +
  'runs after it. If it needs no work, or asks only for an answer, ' +
  'explanation or plan, give it here in full.</system>'
