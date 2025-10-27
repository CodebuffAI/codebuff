import { createBase2 } from './base2'

const definition = {
  ...createBase2('fast', { usesTodos: true }),
  id: 'base2-fast-todos',
  displayName: 'Buffy the Fast Todos Orchestrator',
}
export default definition
