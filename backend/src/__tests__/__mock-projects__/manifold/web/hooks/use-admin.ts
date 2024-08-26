import { useUser } from './use-user'
import { isAdminId, isModId } from 'common/envs/constants'

export const useAdmin = () => {
  const user = useUser()
  return user ? isAdminId(user.id) : false
}

export const useAdminOrMod = () => {
  const user = useUser()
  return user ? isAdminId(user.id) || isModId(user.id) : false
}

export const useTrusted = () => {
  const user = useUser()
  return user ? isModId(user.id) : false
}

export const useDev = () => {
  return process.env.NODE_ENV === 'development'
}
