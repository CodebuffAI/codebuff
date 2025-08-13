import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { describe, expect, it, afterEach, spyOn, mock } from 'bun:test'

import * as versionUtils from '../version-utils'

const {
  versionOne,
  parseVersion,
  stringifyVersion,
  incrementPatchVersion,
  isGreater,
  getLatestAgentVersion,
  determineNextVersion,
  versionExists,
} = versionUtils

describe('version-utils', () => {
  afterEach(() => {
    mock.restore()
    clearMockedModules()
  })

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

  describe('getLatestAgentVersion', () => {
    it('should return version 0.0.0 when no agent exists', async () => {
      // Mock the database to return empty result
      mockModule('@codebuff/common/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    then: (fn: (rows: any[]) => any) => fn([]),
                  }),
                }),
              }),
            }),
          }),
        },
      }))

      const result = await getLatestAgentVersion('test-agent', 'test-publisher')
      expect(result).toEqual({ major: 0, minor: 0, patch: 0 })
    })

    it('should return latest version when agent exists', async () => {
      // Mock the database to return a version
      mockModule('@codebuff/common/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    then: (fn: (rows: any[]) => any) =>
                      fn([{ major: 1, minor: 2, patch: 3 }]),
                  }),
                }),
              }),
            }),
          }),
        },
      }))

      const result = await getLatestAgentVersion('test-agent', 'test-publisher')
      expect(result).toEqual({ major: 1, minor: 2, patch: 3 })
    })

    it('should handle null values in database response', async () => {
      // Mock the database to return null values
      mockModule('@codebuff/common/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    then: (fn: (rows: any[]) => any) =>
                      fn([{ major: null, minor: null, patch: null }]),
                  }),
                }),
              }),
            }),
          }),
        },
      }))

      const result = await getLatestAgentVersion('test-agent', 'test-publisher')
      expect(result).toEqual({ major: 0, minor: 0, patch: 0 })
    })
  })

  describe('determineNextVersion', () => {
    it('should increment patch of latest version when no version provided', async () => {
      spyOn(versionUtils, 'getLatestAgentVersion').mockResolvedValue({
        major: 1,
        minor: 2,
        patch: 3,
      })

      const result = await determineNextVersion('test-agent', 'test-publisher')
      expect(result).toEqual({ major: 1, minor: 2, patch: 4 })
    })

    it('should use provided version when higher than latest', async () => {
      spyOn(versionUtils, 'getLatestAgentVersion').mockResolvedValue({
        major: 0,
        minor: 0,
        patch: 0,
      })

      const result = await determineNextVersion(
        'test-agent',
        'test-publisher',
        '2.0.0',
      )
      expect(result).toEqual({ major: 2, minor: 0, patch: 0 })
    })

    it('should throw error when provided version is not greater than latest', async () => {
      spyOn(versionUtils, 'getLatestAgentVersion').mockResolvedValue({
        major: 2,
        minor: 0,
        patch: 0,
      })

      await expect(
        determineNextVersion('test-agent', 'test-publisher', '1.5.0'),
      ).rejects.toThrow(
        'Provided version 1.5.0 must be greater than the latest version (2.0.0)',
      )
    })

    it('should throw error when provided version equals latest', async () => {
      spyOn(versionUtils, 'getLatestAgentVersion').mockResolvedValue({
        major: 1,
        minor: 5,
        patch: 0,
      })

      await expect(
        determineNextVersion('test-agent', 'test-publisher', '1.5.0'),
      ).rejects.toThrow(
        'Provided version 1.5.0 must be greater than the latest version (1.5.0)',
      )
    })

    it('should throw error for invalid provided version', async () => {
      spyOn(versionUtils, 'getLatestAgentVersion').mockResolvedValue({
        major: 0,
        minor: 0,
        patch: 0,
      })

      await expect(
        determineNextVersion('test-agent', 'test-publisher', 'invalid'),
      ).rejects.toThrow(
        'Invalid version format: invalid. Must be in semver format (e.g., 1.0.0)',
      )
    })
  })

  describe('versionExists', () => {
    it('should return true when version exists', async () => {
      // Mock the database to return a result
      mockModule('@codebuff/common/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                then: (fn: (rows: any[]) => any) => fn([{ id: 'test-agent' }]),
              }),
            }),
          }),
        },
      }))

      const result = await versionExists(
        'test-agent',
        { major: 1, minor: 0, patch: 0 },
        'test-publisher',
      )
      expect(result).toBe(true)
    })

    it('should return false when version does not exist', async () => {
      // Mock the database to return empty result
      mockModule('@codebuff/common/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                then: (fn: (rows: any[]) => any) => fn([]),
              }),
            }),
          }),
        },
      }))

      const result = await versionExists(
        'test-agent',
        { major: 1, minor: 0, patch: 0 },
        'test-publisher',
      )
      expect(result).toBe(false)
    })
  })

  describe('integration tests', () => {
    it('should handle complete version workflow', () => {
      // Test the complete flow of version operations
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
