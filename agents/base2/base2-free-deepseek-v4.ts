import { createBase2 } from './base2'

const definition = {
  ...createBase2('free', {
    noAskUser: true,
    model: 'deepseek/deepseek-v4-pro',
  }),
  id: 'base2-free-deepseek-v4',
  displayName: 'Buffy the DeepSeek V4 Free Orchestrator',
}
export default definition
