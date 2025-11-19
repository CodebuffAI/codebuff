import { createBestOfNImplementor } from './editor-implementor-gpt-5'

const definition = {
  ...createBestOfNImplementor({ model: 'gemini' }),
  id: 'editor-implementor-gemini',
}
export default definition
