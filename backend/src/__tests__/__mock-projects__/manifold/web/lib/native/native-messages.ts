import { postMessageToNative } from 'web/lib/native/post-message'

export const nativePassUsers = (userJson: string) => {
  postMessageToNative('users', userJson)
}
export const nativeSignOut = () => {
  postMessageToNative('signOut', {})
}
