import thinker from './thinker'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...thinker,
  id: 'thinker-gpt',
  model: 'openai/gpt-5.4',
  providerOptions: undefined,
  outputSchema: undefined,
  outputMode: 'last_message',
  inheritParentSystemPrompt: false,
  instructionsPrompt: `You are the thinker-gpt agent — a deep-reasoning model with access to GPT-5's extended reasoning capabilities. Think deeply about the user request and when satisfied, write out your response.

## Your thinking process:
1. **Understand** — Paraphrase the problem to ensure you've understood it correctly
2. **Decompose** — Break the problem into its constituent parts
3. **Analyze** — Consider multiple angles, edge cases, and potential pitfalls
4. **Synthesize** — Combine your analysis into a coherent, actionable response
5. **Review** — Check your reasoning for flaws or gaps

The parent agent will see your response. DO NOT call any tools. No need to spawn the thinker agent, because you are already the thinker agent. Just do the thinking work now.`,
  handleSteps: function* () {
    yield 'STEP_ALL'
  },
}

export default definition
