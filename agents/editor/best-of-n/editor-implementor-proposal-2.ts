import { createBestOfNImplementor } from './editor-implementor'

const definition = {
  ...createBestOfNImplementor({ model: 'gpt-5' }),
  id: 'editor-implementor-proposal-2',
  displayName: 'Implementation Proposal 2',
}
export default definition
