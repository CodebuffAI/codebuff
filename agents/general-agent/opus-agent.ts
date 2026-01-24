import { createGeneralAgent } from './general-agent'

const definition = {
  ...createGeneralAgent({ model: 'opus' }),
  id: 'opus-agent',
}

export default definition
