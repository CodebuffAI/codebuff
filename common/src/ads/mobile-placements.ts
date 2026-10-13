import { isAndroidAdPlacement } from './android-placements'
import { isIOSAdPlacement } from './ios-placements'

export type MobileAdSurface = 'ios' | 'android'

/** The native app that owns a placement, or null for every web/desktop slot. */
export function mobileAdPlacementSurface(
  id: string | null | undefined,
): MobileAdSurface | null {
  if (isIOSAdPlacement(id)) return 'ios'
  if (isAndroidAdPlacement(id)) return 'android'
  return null
}

export function isMobileAdPlacement(id: string | null | undefined): boolean {
  return mobileAdPlacementSurface(id) !== null
}
