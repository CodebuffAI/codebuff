import { isValidBrandHex } from './inline-ad-layout'

/** Assigned by the server to an approved Freebuff partner, never inferred from copy. */
export type PartnerBrand = 'greptile' | 'posthog'

export function isPartnerBrand(value: unknown): value is PartnerBrand {
  return value === 'greptile' || value === 'posthog'
}

export interface PartnerBrandCreative {
  partnerBrand?: PartnerBrand
  brandColor?: string | null
  brandInk?: string | null
}

/** Renderers choose which formats support each designated partner's palette. */
export function partnerBrandColors(ad: PartnerBrandCreative) {
  return isPartnerBrand(ad.partnerBrand) &&
    isValidBrandHex(ad.brandColor) &&
    isValidBrandHex(ad.brandInk)
    ? { background: ad.brandColor!, ink: ad.brandInk! }
    : null
}

/** Existing Greptile treatments also apply outside the above-composer banner. */
export function greptileBrandColors(ad: PartnerBrandCreative) {
  return ad.partnerBrand === 'greptile' ? partnerBrandColors(ad) : null
}
