import { createBase2 } from '../base2'

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
