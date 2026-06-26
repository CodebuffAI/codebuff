import { describe, expect, it } from 'bun:test'

import * as versionUtils from '../version-utils'

const {
  versionOne,
  parseVersion,
  stringifyVersion,
  incrementPatchVersion,
  isGreater,
} = versionUtils

describe('version-utils', () => {
  describe('versionOne', () => {
    it('should return version 0.0.1', () => {
      const result = versionOne()
      expect(result).toEqual({ major: 0, minor: 0, patch: 1 })
    })
  })

  describe('parseVersion', () => {
    it('should parse valid semantic version strings', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
      expect(parseVersion('0.0.1')).toEqual({ major: 0, minor: 0, patch: 1 })
      expect(parseVersion('10.20.30')).toEqual({
        major: 10,
        minor: 20,
        patch: 30,
      })
    })

    it('should throw error for invalid version formats', () => {
      expect(() => parseVersion('1.2')).toThrow(
        'Invalid semantic version format: 1.2',
      )
      expect(() => parseVersion('1.2.3.4')).toThrow(
        'Invalid semantic version format: 1.2.3.4',
      )
      expect(() => parseVersion('v1.2.3')).toThrow(
        'Invalid semantic version format: v1.2.3',
      )
      expect(() => parseVersion('1.2.3-alpha')).toThrow(
        'Invalid semantic version format: 1.2.3-alpha',
      )
      expect(() => parseVersion('')).toThrow(
        'Invalid semantic version format: ',
      )
      expect(() => parseVersion('abc.def.ghi')).toThrow(
        'Invalid semantic version format: abc.def.ghi',
      )
    })
  })

  describe('stringifyVersion', () => {
    it('should convert version object to string', () => {
      expect(stringifyVersion({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3')
      expect(stringifyVersion({ major: 0, minor: 0, patch: 1 })).toBe('0.0.1')
      expect(stringifyVersion({ major: 10, minor: 20, patch: 30 })).toBe(
        '10.20.30',
      )
    })
  })

  describe('incrementPatchVersion', () => {
    it('should increment patch version by 1', () => {
      expect(incrementPatchVersion({ major: 1, minor: 2, patch: 3 })).toEqual({
        major: 1,
        minor: 2,
        patch: 4,
      })
      expect(incrementPatchVersion({ major: 0, minor: 0, patch: 0 })).toEqual({
        major: 0,
        minor: 0,
        patch: 1,
      })
    })

    it('should not modify the original version object', () => {
      const original = { major: 1, minor: 2, patch: 3 }
      const result = incrementPatchVersion(original)
      expect(original).toEqual({ major: 1, minor: 2, patch: 3 })
      expect(result).toEqual({ major: 1, minor: 2, patch: 4 })
    })
  })

  describe('isGreater', () => {
    it('should return true when first version has higher major version', () => {
      const v1 = { major: 2, minor: 0, patch: 0 }
      const v2 = { major: 1, minor: 9, patch: 9 }
      expect(isGreater(v1, v2)).toBe(true)
      expect(isGreater(v2, v1)).toBe(false)
    })

    it('should return true when first version has higher minor version and same major', () => {
      const v1 = { major: 1, minor: 2, patch: 0 }
      const v2 = { major: 1, minor: 1, patch: 9 }
      expect(isGreater(v1, v2)).toBe(true)
      expect(isGreater(v2, v1)).toBe(false)
    })

    it('should return true when first version has higher patch version and same major/minor', () => {
      const v1 = { major: 1, minor: 2, patch: 4 }
      const v2 = { major: 1, minor: 2, patch: 3 }
      expect(isGreater(v1, v2)).toBe(true)
      expect(isGreater(v2, v1)).toBe(false)
    })

    it('should return false when versions are equal', () => {
      const v1 = { major: 1, minor: 2, patch: 3 }
      const v2 = { major: 1, minor: 2, patch: 3 }
      expect(isGreater(v1, v2)).toBe(false)
      expect(isGreater(v2, v1)).toBe(false)
    })
  })

  describe('integration tests', () => {
    it('should handle complete version workflow', () => {
      const version1 = parseVersion('1.2.3')
      const version2 = parseVersion('1.2.4')
      const isV2Greater = isGreater(version2, version1)
      const nextVersion = incrementPatchVersion(version2)
      const versionString = stringifyVersion(nextVersion)

      expect(isV2Greater).toBe(true)
      expect(versionString).toBe('1.2.5')
    })

    it('should handle edge cases with versionOne', () => {
      const one = versionOne()
      const incremented = incrementPatchVersion(one)
      const isIncrementedGreater = isGreater(incremented, one)

      expect(isIncrementedGreater).toBe(true)
      expect(incremented).toEqual({ major: 0, minor: 0, patch: 2 })
    })
  })
})
