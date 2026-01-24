import { createGeneralAgent } from './general-agent'

const definition = {
  ...createGeneralAgent({ model: 'gpt-5' }),
  id: 'gpt-5-agent',
}

export default definition
