import { type APIHandler } from './helpers/endpoint'
import { getUser } from 'api/get-user'

export const getMe: APIHandler<'me'> = async (_, auth) => {
  return getUser({ id: auth.uid })
}
