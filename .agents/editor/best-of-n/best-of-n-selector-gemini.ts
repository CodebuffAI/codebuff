import { createBestOfNSelector } from './best-of-n-selector'

const definition = {
  ...createBestOfNSelector({ model: 'gemini' }),
  id: 'best-of-n-selector-gemini',
  displayName: 'Best-of-N Gemini Selector',
}
export default definition