import { createBestOfNImplementor } from './editor-implementor'

const definition = {
  ...createBestOfNImplementor({ model: 'gemini' }),
  id: 'editor-implementor-gemini',
}
export default definition
