import { app } from 'web/lib/firebase/init'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getSourceUrl, Notification } from 'common/notification'
import {
  handlePushNotificationPermissionStatus,
  setPushToken,
} from 'web/lib/supabase/notifications'
import { useRouter } from 'next/router'
import { setInstalledAppPlatform, setIsNative } from 'web/lib/native/is-native'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { useEffect } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { useEvent } from 'web/hooks/use-event'
import { auth } from 'web/lib/firebase/users'
import { User as FirebaseUser } from 'firebase/auth'
import { postMessageToNative } from 'web/lib/native/post-message'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'

export const NativeMessageListener = () => {
  const router = useRouter()
  const privateUser = usePrivateUser()

  useEffect(() => {
    postMessageToNative('startedListening', {})
  }, [])

  useEffect(() => {
    const { nativePlatform } = router.query
    if (nativePlatform !== undefined) {
      const platform = nativePlatform as string
      setIsNative(true, platform)
      if (privateUser) setInstalledAppPlatform(privateUser, platform)
    }
  }, [privateUser, router.query])

  const handleNativeMessage = useEvent(
    async (type: nativeToWebMessageType, data: MesageTypeMap[typeof type]) => {
      if (type === 'nativeFbUser') {
        console.log('received nativeFbUser')
        const user = data as FirebaseUser
        if (auth.currentUser?.email !== user.email)
          await setFirebaseUserViaJson(user, app, true)
      } else if (type === 'pushNotificationPermissionStatus') {
        const { status } =
          data as MesageTypeMap['pushNotificationPermissionStatus']
        await handlePushNotificationPermissionStatus(status)
      } else if (type === 'pushToken') {
        const { token } = data as MesageTypeMap['pushToken']
        await setPushToken(token)
      } else if (type === 'notification') {
        const notification = data as Notification
        // TODO: mark the notification as seen
        const sourceUrl = getSourceUrl(notification)
        console.log('sourceUrl', sourceUrl)
        try {
          router.push(sourceUrl)
        } catch (e) {
          console.log(`Error navigating to notification route ${sourceUrl}`, e)
        }
      } else if (type === 'link') {
        const { url } = data as MesageTypeMap['link']
        const newRoute = url.startsWith('/') ? url : '/' + url
        console.log('Received link from native, current route', router.asPath)
        if (router.asPath === newRoute) return
        console.log('Navigating to link from native:', newRoute)
        try {
          await router.push(newRoute)
        } catch (e) {
          console.log(`Error navigating to linked route`, e)
        }
      }
    }
  )

  useNativeMessages(
    [
      'nativeFbUser',
      'pushNotificationPermissionStatus',
      'pushToken',
      'notification',
      'link',
    ],
    handleNativeMessage
  )

  return <div />
}
