import type { Message } from '../messages/codebuff-message'

/**
 * Records agent message histories for debugging (e.g. to a trace.jsonl file).
 *
 * Callers pass the agent's full message history at each step boundary;
 * implementations are expected to persist each message only once (appending
 * the delta since the previous call for the same agentId), so calling this
 * every step does not grow storage quadratically.
 */
export type TraceWriter = {
  recordStep: (params: {
    agentId: string
    agentType: string
    runId: string | undefined
    userInputId: string
    step: number
    system: string | undefined
    messages: Message[]
  }) => void
}
