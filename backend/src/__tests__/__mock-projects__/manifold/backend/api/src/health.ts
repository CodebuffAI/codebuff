import { authEndpoint } from './helpers/endpoint'

export const health = authEndpoint(async (_, auth) => {
  return {
    message: 'Server is working.',
    uid: auth.uid,
  }
})
