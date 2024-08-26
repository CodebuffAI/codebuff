import { useState } from 'react'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { APIError } from 'common/api/utils'
import { User } from 'common/user'
import { updateUser } from 'web/lib/api/api'

type UserInfoState = {
  name: string
  username: string
  loadingName: boolean
  loadingUsername: boolean
  errorName: string
  errorUsername: string
}

export const useEditableUserInfo = (user: User) => {
  const [userInfo, setUserInfo] = useState<UserInfoState>({
    name: user.name,
    username: user.username,
    loadingName: false,
    loadingUsername: false,
    errorName: '',
    errorUsername: '',
  })

  const updateUserState = (newState: Partial<UserInfoState>) => {
    setUserInfo((prevState) => ({ ...prevState, ...newState }))
  }

  const updateDisplayName = async () => {
    const newName = cleanDisplayName(userInfo.name)
    if (newName === user.name) return

    updateUserState({ loadingName: true, errorName: '' })
    if (!newName) return updateUserState({ name: user.name })

    try {
      await updateUser({ name: newName })
      updateUserState({ errorName: '', name: newName })
    } catch (reason) {
      updateUserState({
        errorName: (reason as APIError).message,
        name: user.name,
      })
    }

    updateUserState({ loadingName: false })
  }

  const updateUsername = async () => {
    const newUsername = cleanUsername(userInfo.username)
    if (newUsername === user.username) return

    updateUserState({ loadingUsername: true, errorUsername: '' })

    try {
      await updateUser({ username: newUsername })
      updateUserState({ errorUsername: '', username: newUsername })
    } catch (reason) {
      updateUserState({
        errorUsername: (reason as APIError).message,
        username: user.username,
      })
    }

    updateUserState({ loadingUsername: false })
  }

  return {
    userInfo,
    updateDisplayName,
    updateUsername,
    updateUserState,
  }
}
