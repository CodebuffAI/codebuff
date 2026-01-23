import { createBestOfNSelector } from './best-of-n-selector'

const definition = {
  ...createBestOfNSelector({ model: 'opus' }),
  id: 'best-of-n-selector-opus',
}
export default definition
