import { createBase2 } from './base2'

const definition = {
  ...createBase2('default', { withGemini: true }),
  id: 'base2-gemini',
  displayName: 'Buffy the Gemini Orchestrator',
}
export default definition
