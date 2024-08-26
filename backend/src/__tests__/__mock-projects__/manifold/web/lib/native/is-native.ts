import { IS_NATIVE_KEY, PLATFORM_KEY } from 'common/native-message'
import { PrivateUser } from 'common/user'
import { uniq } from 'lodash'
import { safeLocalStorage, safeSessionStorage } from 'web/lib/util/local'
import { api } from '../api/api'

export const getIsNative = () => {
  // TODO cache the result of this in memory
  const { isNative } = getNativeInfo()
  return isNative
}

export const getNativePlatform = () => {
  return getNativeInfo()
}

const getNativeInfo = () => {
  if (typeof window === 'undefined') return { isNative: false, platform: '' }
  const local = safeLocalStorage
  const ss = safeSessionStorage
  const isNative = local?.getItem(IS_NATIVE_KEY) || ss?.getItem(IS_NATIVE_KEY)
  const platform = local?.getItem(PLATFORM_KEY) || ss?.getItem(PLATFORM_KEY)
  return { isNative: isNative === 'true', platform }
}

export const setIsNative = (isNative: boolean, platform: string) => {
  const local = safeLocalStorage
  const ss = safeSessionStorage
  local?.setItem(IS_NATIVE_KEY, isNative ? 'true' : 'false')
  ss?.setItem(IS_NATIVE_KEY, isNative ? 'true' : 'false')
  if (platform) {
    local?.setItem(PLATFORM_KEY, platform)
    ss?.setItem(PLATFORM_KEY, platform)
  }
}

export const setInstalledAppPlatform = (
  privateUser: PrivateUser,
  platform: string
) => {
  if (privateUser.installedAppPlatforms?.includes(platform)) return
  api('me/private/update', {
    installedAppPlatforms: uniq([
      ...(privateUser.installedAppPlatforms ?? []),
      platform,
    ]),
  })
}
