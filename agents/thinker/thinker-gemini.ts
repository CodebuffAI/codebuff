import { FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import thinker from './thinker'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

/**
 * The freebuff.com/chat thinker child, spawned by base-chat.
 *
 * MOVED OFF GEMINI 3.1 PRO ON 2026-09-01. The Google credit grant that paid for
 * it ran out, and at list price this one agent was ~$2,700/week — nine times
 * the chat root models combined — because every spawn re-reads the whole
 * conversation (~52k input tokens a call) at $2/M. DeepSeek V4 Flash at the
 * same token volume is ~$70-85/week, runs on our own DeepSeek direct and
 * Luminal lanes rather than Merge, and thinks natively.
 *
 * The id stays `thinker-gemini`: chat/agent.ts registers it by import, the
 * hidden-agent list and FREEBUFF_GEMINI_PRO_AGENT_IDS name it, and base-chat's
 * prompt spawns it by name. Renaming buys nothing and touches all of them.
 *
 * Reasoning is declared explicitly rather than left to the catalog default
 * (also `high`): the DeepSeek lane maps `reasoning` onto its `thinking` flag,
 * and a thinker that does not think is just a slower copy of the root.
 */
const definition: SecretAgentDefinition = {
  ...thinker,
  id: 'thinker-gemini',
  displayName: 'Thinker',
  model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  providerOptions: undefined,
  reasoningOptions: {
    enabled: true,
    effort: 'high',
  },
  outputSchema: undefined,
  outputMode: 'last_message',
  inheritParentSystemPrompt: false,
  instructionsPrompt: `You are the thinker-gemini agent. Think about the user request and when satisfied, write out a very concise response that captures the most important points. DO NOT be verbose -- say the absolute minimum needed to answer the user's question correctly.
  
The parent agent will see your response. DO NOT call any tools. No need to spawn the thinker agent, because you are already the thinker agent. Just do the thinking work now.`,
  handleSteps: function* () {
    yield 'STEP'
  },
}

export default definition
