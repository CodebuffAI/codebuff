import { postMessageToNative } from 'web/lib/native/post-message'
import { api } from '../api/api'

export const setPushToken = async (pushToken: string) => {
  try {
    console.log('setting push token' + pushToken)
    await api('set-push-token', { pushToken })
  } catch (e) {
    console.error('error setting user push token', e)
    postMessageToNative('error', 'Error setting push token')
  }
}

export const handlePushNotificationPermissionStatus = async (
  status: 'denied' | 'undetermined'
) => {
  const privateUser = await api('me/private')
  if (!privateUser || privateUser.pushToken) return
  if (status === 'denied') {
    await setPushTokenRequestDenied()
  }
}

export const setPushTokenRequestDenied = async () => {
  console.log('push token denied')
  await api('me/private/update', {
    rejectedPushNotificationsOn: Date.now(),
    interestedInPushNotifications: false,
  })
}
