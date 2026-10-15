import { describe, expect, test } from 'bun:test'

import { adSignalsAllowed, readAdSignalsConsent } from '../android-ad-signals'

describe('adSignalsAllowed', () => {
  test('outside the region, collected unless denied', () => {
    expect(adSignalsAllowed({ country: 'US', consent: 'unknown' })).toBe(true)
    expect(adSignalsAllowed({ country: 'us', consent: 'unknown' })).toBe(true)
    expect(adSignalsAllowed({ country: 'US', consent: 'denied' })).toBe(false)
  })

  test('inside the region or unresolved, only granted collects', () => {
    for (const country of ['FR', 'GB', 'CH', 'IS', null, '']) {
      expect(adSignalsAllowed({ country, consent: 'unknown' })).toBe(false)
      expect(adSignalsAllowed({ country, consent: 'granted' })).toBe(true)
    }
  })

  test('the header reads only the two explicit choices', () => {
    expect(readAdSignalsConsent('Granted ')).toBe('granted')
    expect(readAdSignalsConsent('denied')).toBe('denied')
    expect(readAdSignalsConsent('yes')).toBe('unknown')
    expect(readAdSignalsConsent(null)).toBe('unknown')
  })
})
