import { GPSData } from 'common/gidx/gidx'
import { Notification } from 'common/notification'

export type nativeToWebMessageType =
  | 'iapReceipt'
  | 'iapError'
  | 'nativeFbUser'
  | 'pushNotificationPermissionStatus'
  | 'pushToken'
  | 'notification'
  | 'link'
  | 'location'

export type nativeToWebMessage = {
  type: nativeToWebMessageType
  data: any
}

export type webToNativeMessage = {
  type: webToNativeMessageType
  data: any
}

export type webToNativeMessageType =
  | 'checkout'
  | 'openUrl'
  | 'tryToGetPushTokenWithoutPrompt'
  | 'loginClicked'
  | 'copyToClipboard'
  | 'promptEnablePushNotifications'
  | 'signOut'
  | 'users'
  | 'error'
  | 'onPageVisit'
  | 'share'
  | 'theme'
  | 'log'
  | 'startedListening'
  | 'locationRequested'

export const IS_NATIVE_KEY = 'is-native'
export const PLATFORM_KEY = 'native-platform'

export type MesageTypeMap = {
  location: GPSData | { error: string }
  iapReceipt: { receipt: string }
  iapError: object
  nativeFbUser: object
  pushNotificationPermissionStatus: {
    status: 'denied' | 'undetermined'
  }
  pushToken: {
    token: string
  }
  notification: Notification
  link: {
    url: string
  }
}
