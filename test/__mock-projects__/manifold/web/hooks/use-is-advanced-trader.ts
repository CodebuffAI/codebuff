import { useUser } from './use-user'

export const useIsAdvancedTrader = () => {
  const user = useUser()
  return !!user?.isAdvancedTrader
}
