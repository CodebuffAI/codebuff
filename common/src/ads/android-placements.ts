/** Native inventory has its own attribution; never alias it to a web or iOS slot. */
export const ANDROID_AD_SURFACE = 'android' as const
export const ANDROID_AD_PLACEMENTS = [
  {
    id: 'Android-Chat-After-Assistant-Message',
    label: 'Chat · after an answer',
  },
  {
    id: 'Android-Coding-After-Assistant-Message',
    label: 'Coding · after an answer',
  },
] as const

export function isAndroidAdPlacement(id: string | null | undefined): boolean {
  return ANDROID_AD_PLACEMENTS.some((slot) => slot.id === id)
}
