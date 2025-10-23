import { createBase2 } from '../base2'

const base2Fast = createBase2('fast')
const definition = {
  ...base2Fast,
  id: 'base2-fast-thinking-tool',
  displayName: 'Buffy the Fast Thinking Tool Orchestrator',
  toolNames: [...(base2Fast.toolNames ?? []), 'think_deeply'],
  instructionsPrompt: `${base2Fast.instructionsPrompt}

## Thinking

Before each response, you must use the think_deeply tool to think about what you will do next to work towards completing the user's request. Be extremely concise in your thinking. You can skip thinking if you already know what to do.`,
}
export default definition
