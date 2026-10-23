import { expect, test } from 'bun:test'
import {
  greptileBrandColors,
  isPartnerBrand,
  partnerBrandColors,
} from './partner-brand'

test('partner palettes require a known designation and two safe colors', () => {
  const palette = { brandColor: '#f3f0e8', brandInk: '#151515' }
  expect(partnerBrandColors({ ...palette, partnerBrand: 'posthog' })).toEqual({
    background: '#f3f0e8',
    ink: '#151515',
  })
  expect(partnerBrandColors(palette)).toBeNull()
  expect(partnerBrandColors({
    ...palette, partnerBrand: 'posthog', brandColor: 'url(bad)',
  })).toBeNull()
  expect(partnerBrandColors({
    partnerBrand: 'posthog', brandColor: '#f3f0e8',
  })).toBeNull()
  expect(isPartnerBrand('posthog')).toBe(true)
  expect(isPartnerBrand('greptile')).toBe(true)
  expect(isPartnerBrand('PostHog')).toBe(false)
  expect(isPartnerBrand('unknown')).toBe(false)
})

test('existing non-banner branding stays exclusive to Greptile', () => {
  const palette = { brandColor: '#28E99F', brandInk: '#0A0A0A' }
  expect(greptileBrandColors({ ...palette, partnerBrand: 'greptile' })).toEqual({
    background: '#28E99F',
    ink: '#0A0A0A',
  })
  expect(greptileBrandColors({ ...palette, partnerBrand: 'posthog' })).toBeNull()
})
