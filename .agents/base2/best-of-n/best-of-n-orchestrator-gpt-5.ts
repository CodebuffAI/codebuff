import { createBestOfNOrchestrator } from './best-of-n-orchestrator'

const definition = {
  ...createBestOfNOrchestrator('gpt-5'),
  id: 'best-of-n-orchestrator-gpt-5',
}
export default definition
