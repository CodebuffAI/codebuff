import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    noAskUser: true,
    model: 'google/gemini-3.1-pro-preview',
    providerOptions: {},
  }),
  id: 'base2-gemini-evals',
  displayName: 'Buffy the Gemini Orchestrator',
}

export default definition
