import { useEffect, useState } from 'react'
import { canSendMana } from 'common/can-send-mana'
import { User } from 'common/user'
import { api } from 'web/lib/api/api'

export const useCanSendMana = (user: User) => {
  const [canSend, setCanSend] = useState({
    canSend: false,
    message: '',
  })
  useEffect(() => {
    canSendMana(user, () =>
      api('get-user-portfolio', { userId: user.id })
    ).then(setCanSend)
  }, [user])
  return canSend
}
