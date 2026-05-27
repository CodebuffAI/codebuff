import { createBestOfNImplementor } from './editor-implementor'

const definition = {
  ...createBestOfNImplementor({ model: 'gpt-5', allowReadOnlyTools: false }),
  id: 'editor-implementor-proposal-direct',
  displayName: 'Implementation Proposal Direct Retry',
}
export default definition
