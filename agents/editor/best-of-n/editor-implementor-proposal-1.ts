import { createBestOfNImplementor } from './editor-implementor'

const definition = {
  ...createBestOfNImplementor({ model: 'gpt-5' }),
  id: 'editor-implementor-proposal-1',
  displayName: 'Implementation Proposal 1',
}
export default definition
