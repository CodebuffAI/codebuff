import { FirebaseApp } from '@firebase/app'
import {
  Auth as FirebaseAuth,
  getAuth,
  updateCurrentUser,
  User as FirebaseUser,
} from 'firebase/auth'

// The Firebase SDK doesn't really support persisting the logged-in state between
// devices, or anything like that. To get it from the client to the server:
//
// 1. We pack up the user by calling (the undocumented) User.toJSON(). This is the
//    same way the Firebase SDK saves it to disk, so it's gonna have the right stuff.
//
// 2. We put it into a cookie and read the cookie out here.
//
// 3. We use the Firebase "persistence manager" to write the cookie value into the persistent
//    store on the server (an in-memory store), just as if the SDK had saved the user itself.
//
// 4. We ask the persistence manager for the current user, which reads what we just wrote,
//    and creates a real puffed-up internal user object from the serialized user.
//
// 5. We set that user to be the current Firebase user in the SDK.
//
// 6. We ask for the ID token, which will refresh it if necessary (i.e. if this cookie
//    is from an old browser session), so that we know the SDK is prepared to do real
//    Firebase queries.
//
// This strategy should be robust, since it's repurposing Firebase's internal persistence
// machinery, but the details may eventually need updating for new versions of the SDK.
//
// References:
// Persistence manager: https://github.com/firebase/firebase-js-sdk/blob/39f4635ebc07316661324145f1b8c27f9bd7aedb/packages/auth/src/core/persistence/persistence_user_manager.ts#L64
// Token manager: https://github.com/firebase/firebase-js-sdk/blob/39f4635ebc07316661324145f1b8c27f9bd7aedb/packages/auth/src/core/user/token_manager.ts#L76

export interface FirebaseAuthInternal extends FirebaseAuth {
  persistenceManager: {
    fullUserKey: string
    getCurrentUser: () => Promise<FirebaseUser | null>
    persistence: {
      _set: (k: string, obj: FirebaseUser) => Promise<void>
    }
  }
}

export const setFirebaseUserViaJson = async (
  deserializedUser: FirebaseUser,
  app: FirebaseApp,
  isNative?: boolean
) => {
  try {
    const clientAuth = getAuth(app) as FirebaseAuthInternal
    const persistenceManager = clientAuth.persistenceManager
    if (!persistenceManager) {
      console.warn('Persistence not found on Firebase, not setting user.')
      return
    }
    const persistence = persistenceManager.persistence
    await persistence._set(persistenceManager.fullUserKey, deserializedUser)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fbUser = (await persistenceManager.getCurrentUser())!
    await fbUser?.getIdToken() // forces a refresh if necessary
    await updateCurrentUser(clientAuth, fbUser)
    console.log('successfully set user via json', fbUser.displayName)
    return fbUser
  } catch (e) {
    if (typeof window !== 'undefined') {
      if (isNative) {
        // eslint-disable-next-line @typescript-eslint/no-extra-semi
        ;(window as any).ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: 'error',
            data: `Error setting Firebase user: ${e}`,
          })
        )
      }
    }
    console.error('deserializing', e)
    return null
  }
}
