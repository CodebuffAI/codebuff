import { expect, test } from 'bun:test'
import { messageSentSurface, mobileClientPlatform } from '../client-platform'

test('only ios and android are native platforms; anything else stays unknown', () => {
  expect(mobileClientPlatform('ios')).toBe('ios')
  expect(mobileClientPlatform('android')).toBe('android')
  for (const value of [undefined, null, '', 'browser', 'desktop', 'ios, android', {}, 1]) {
    expect(mobileClientPlatform(value)).toBeUndefined()
  }
})

test('a native send reports its platform as the surface; any other keeps its own', () => {
  expect(messageSentSurface('chat', 'ios')).toBe('ios')
  expect(messageSentSurface('desktop', 'android')).toBe('android')
  expect(messageSentSurface('cloud', 'desktop')).toBe('cloud')
  expect(messageSentSurface('web', undefined)).toBe('web')
})
