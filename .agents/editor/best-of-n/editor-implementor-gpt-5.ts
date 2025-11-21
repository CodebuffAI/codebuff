import { createBestOfNImplementor } from './editor-implementor'

const definition = {
  ...createBestOfNImplementor({ model: 'gpt-5' }),
  id: 'editor-implementor-gpt-5',
}
export default definition
