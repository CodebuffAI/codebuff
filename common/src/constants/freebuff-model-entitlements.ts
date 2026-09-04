export type FreebuffAccessTier = 'full' | 'limited'

export type FreebuffDesktopConcurrency = 'slot-bound' | 'multi-tab'

export const FREEBUFF_SOLAR_PRO_4_ENTITLEMENT = {
  modelId: 'upstage/solar-pro4',
  fullAccess: {
    premium: false,
  },
  limitedAccess: true,
} as const

export const FREEBUFF_SOLAR_PRO_4_MODEL_ID =
  FREEBUFF_SOLAR_PRO_4_ENTITLEMENT.modelId
