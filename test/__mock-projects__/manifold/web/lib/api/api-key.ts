import { api } from './api'

export const generateNewApiKey = async () => {
  const newApiKey = crypto.randomUUID()

  try {
    await api('me/private/update', { apiKey: newApiKey })
  } catch (e) {
    console.error(e)
    return undefined
  }
  return newApiKey
}
