'use client'
import { createContext, ReactNode, useEffect, useState } from 'react'
import { pickBy } from 'lodash'
import { onIdTokenChanged, User as FirebaseUser } from 'firebase/auth'
import { auth, firebaseLogout } from 'web/lib/firebase/users'
import { createUser } from 'web/lib/api/api'
import { randomString } from 'common/util/random'
import { identifyUser, setUserProperty } from 'web/lib/service/analytics'
import { useStateCheckEquality } from 'web/hooks/use-state-check-equality'
import {
  AUTH_COOKIE_NAME,
  BLESSED_BANNED_USER_IDS,
  TEN_YEARS_SECS,
} from 'common/envs/constants'
import { getCookie, setCookie } from 'web/lib/util/cookie'
import {
  type PrivateUser,
  type User,
  type UserAndPrivateUser,
} from 'common/user'
import { nativePassUsers, nativeSignOut } from 'web/lib/native/native-messages'
import { safeLocalStorage } from 'web/lib/util/local'
import { getSavedContractVisitsLocally } from 'web/hooks/use-save-visits'
import { getSupabaseToken } from 'web/lib/api/api'
import { updateSupabaseAuth } from 'web/lib/supabase/db'
import { useWebsocketUser, useWebsocketPrivateUser } from 'web/hooks/use-user'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { getPrivateUserSafe, getUserSafe } from 'web/lib/supabase/users'

// Either we haven't looked up the logged in user yet (undefined), or we know
// the user is not logged in (null), or we know the user is logged in.
export type AuthUser =
  | undefined
  | null
  | (UserAndPrivateUser & { authLoaded: boolean })
const CACHED_USER_KEY = 'CACHED_USER_KEY_V2'

export const ensureDeviceToken = () => {
  let deviceToken = safeLocalStorage?.getItem('device-token')
  if (!deviceToken) {
    deviceToken = randomString()
    safeLocalStorage?.setItem('device-token', deviceToken)
  }
  return deviceToken
}
const getAdminToken = () => {
  const key = 'TEST_CREATE_USER_KEY'
  const cookie = getCookie(key)
  if (cookie) return cookie.replace(/"/g, '')

  // For our convenience. If there's a token in local storage, set it as a cookie
  const localStorageToken = safeLocalStorage?.getItem(key)
  if (localStorageToken) {
    setCookie(key, localStorageToken.replace(/"/g, ''))
  }
  return localStorageToken?.replace(/"/g, '') ?? ''
}

const stripUserData = (user: object) => {
  // there's some risk that this cookie could be too big for some clients,
  // so strip it down to only the keys that the server auth actually needs
  // in order to auth to the firebase SDK
  const whitelist = ['uid', 'emailVerified', 'isAnonymous', 'stsTokenManager']
  const stripped = pickBy(user, (_v, k) => whitelist.includes(k))
  // mqp: temp fix to get cookie size under 4k in edge cases
  delete (stripped as any).stsTokenManager.accessToken
  return JSON.stringify(stripped)
}

const setUserCookie = (data: object | undefined) => {
  const stripped = data ? stripUserData(data) : ''
  setCookie(AUTH_COOKIE_NAME, stripped, [
    ['path', '/'],
    ['max-age', (data === undefined ? 0 : TEN_YEARS_SECS).toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
}

export const AuthContext = createContext<AuthUser>(undefined)

export function AuthProvider(props: {
  children: ReactNode
  serverUser?: AuthUser
}) {
  const { children, serverUser } = props

  const [user, setUser] = useStateCheckEquality<User | undefined | null>(
    serverUser ? serverUser.user : serverUser
  )
  const [privateUser, setPrivateUser] = useStateCheckEquality<
    PrivateUser | undefined
  >(serverUser ? serverUser.privateUser : undefined)
  const [authLoaded, setAuthLoaded] = useState(false)

  const authUser = !user
    ? user
    : !privateUser
    ? privateUser
    : { user, privateUser, authLoaded }

  useEffect(() => {
    if (serverUser === undefined) {
      const cachedUser = safeLocalStorage?.getItem(CACHED_USER_KEY)
      const parsed = cachedUser ? JSON.parse(cachedUser) : undefined
      if (parsed) {
        setUser(parsed.user)
        setPrivateUser(parsed.privateUser)
        setAuthLoaded(false)
      } else setUser(undefined)
    }
  }, [serverUser])

  useEffect(() => {
    if (authUser) {
      if (
        authUser.user.isBannedFromPosting &&
        !BLESSED_BANNED_USER_IDS.includes(authUser.user.id)
      ) {
        firebaseLogout()
        return
      }
      // Persist to local storage, to reduce login blink next time.
      // Note: Cap on localStorage size is ~5mb
      safeLocalStorage?.setItem(CACHED_USER_KEY, JSON.stringify(authUser))
    } else if (authUser === null) {
      safeLocalStorage?.removeItem(CACHED_USER_KEY)
    }
  }, [authUser])

  const onAuthLoad = (
    fbUser: FirebaseUser,
    user: User,
    privateUser: PrivateUser
  ) => {
    setUser(user)
    setPrivateUser(privateUser)
    setAuthLoaded(true)

    nativePassUsers(
      JSON.stringify({
        fbUser: fbUser.toJSON(),
        privateUser: privateUser,
      })
    )

    // generate auth token
    fbUser.getIdToken()
  }

  useEffect(() => {
    return onIdTokenChanged(
      auth,
      async (fbUser) => {
        if (fbUser) {
          setUserCookie(fbUser.toJSON())

          const [user, privateUser, supabaseJwt] = await Promise.all([
            getUserSafe(fbUser.uid),
            getPrivateUserSafe(),
            getSupabaseToken().catch((e) => {
              console.error('Error getting supabase token', e)
              return null
            }),
          ])
          // When testing on a mobile device, we'll be pointed at a local ip or ngrok address, so this will fail
          if (supabaseJwt) updateSupabaseAuth(supabaseJwt.jwt)

          if (!user || !privateUser) {
            const deviceToken = ensureDeviceToken()
            const adminToken = getAdminToken()

            const newUser = (await createUser({
              deviceToken,
              adminToken,
              visitedContractIds: getSavedContractVisitsLocally(),
            })) as UserAndPrivateUser

            onAuthLoad(fbUser, newUser.user, newUser.privateUser)
          } else {
            onAuthLoad(fbUser, user, privateUser)
          }
        } else {
          // User logged out; reset to null
          setUserCookie(undefined)
          setUser(null)
          setPrivateUser(undefined)
          nativeSignOut()
          // Clear local storage only if we were signed in, otherwise we'll clear referral info
          if (safeLocalStorage?.getItem(CACHED_USER_KEY)) localStorage.clear()
        }
      },
      (e) => {
        console.error(e)
      }
    )
  }, [])

  const uid = authUser ? authUser.user.id : authUser

  useEffect(() => {
    if (uid) {
      identifyUser(uid)
    } else if (uid === null) {
      identifyUser(null)
    }
  }, [uid])

  const listenUser = useWebsocketUser(uid ?? undefined)
  useEffectCheckEquality(() => {
    if (authLoaded && listenUser) setUser(listenUser)
  }, [authLoaded, listenUser])

  const listenPrivateUser = useWebsocketPrivateUser(uid ?? undefined)
  useEffectCheckEquality(() => {
    if (authLoaded && listenPrivateUser) setPrivateUser(listenPrivateUser)
  }, [authLoaded, listenPrivateUser])

  const username = authUser?.user.username
  useEffect(() => {
    if (username != null) {
      setUserProperty('username', username)
    }
  }, [username])

  return (
    <AuthContext.Provider value={authUser}>{children}</AuthContext.Provider>
  )
}
