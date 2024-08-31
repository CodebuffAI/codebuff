import { PrivateUser, User } from 'common/user'
import { useEffect, useState } from 'react'
import { getRecentlyActiveUsers } from 'web/lib/supabase/users'

export const useRecentlyActiveUsersAndPrivateUsers = (limit: number) => {
  const [usersAndPrivates, setUsersAndPrivates] = useState<
    {
      user: User
      privateUser: PrivateUser | undefined
    }[]
  >()
  const loadUsers = async () => {
    const users = await getRecentlyActiveUsers(limit)
    const usersAndPrivates = users.map((user) => ({
      user,
      privateUser: undefined,
    }))
    setUsersAndPrivates(usersAndPrivates)
  }
  useEffect(() => {
    loadUsers()
  }, [limit])

  return usersAndPrivates
}
