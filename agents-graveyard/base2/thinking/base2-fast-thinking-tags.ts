import { createBase2 } from '../base2'

const base2Fast = createBase2('fast')
const definition = {
  ...base2Fast,
  id: 'base2-fast-thinking-tags',
  displayName: 'Buffy the Fast Thinking Tags Orchestrator',
  instructionsPrompt: `${base2Fast.instructionsPrompt}

## Thinking

Before each response, you must use the <thinking> tags to think about what you will do next to work towards completing the user's request. Be extremely concise in your thinking.`,
}
export default definition
