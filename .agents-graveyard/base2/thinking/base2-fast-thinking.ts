import { createBase2 } from '../../../.agents/base2/base2'

const definition = {
  ...createBase2('fast'),
  id: 'base2-fast-thinking',
  displayName: 'Buffy the Fast Thinking Orchestrator',
  reasoningOptions: {
    enabled: true,
    exclude: false,
    effort: 'low',
  },
}
export default definition
