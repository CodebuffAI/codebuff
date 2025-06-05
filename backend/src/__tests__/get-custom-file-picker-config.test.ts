import {
  describe,
  expect,
  it,
  mock as bunMockFn,
  spyOn as bunSpyOn,
  beforeEach,
  afterEach,
  Mock,
} from 'bun:test'
import { getCustomFilePickerConfigForOrg } from '../find-files/request-files-prompt'
import * as requestContextModule from '../websockets/request-context'

const mockLimitFn = bunMockFn().mockResolvedValue([])
const mockWhereFn = bunMockFn(() => ({ limit: mockLimitFn }))
const mockFromFn = bunMockFn(() => ({ where: mockWhereFn }))
const mockSelectFn = bunMockFn(() => ({ from: mockFromFn }))

const mockDbObject = {
  select: mockSelectFn,
}

bunMockFn.module('common/db', () => ({
  default: mockDbObject,
}))

bunMockFn.module('../util/logger', () => ({
  logger: {
    info: bunMockFn(() => {}),
    error: bunMockFn(() => {}),
    warn: bunMockFn(() => {}),
    debug: bunMockFn(() => {}),
  },
}))

let getRequestContextSpy: any // Explicitly typed as any

const validConfigString = JSON.stringify({
  modelName: 'ft_filepicker_005',
  maxFilesPerRequest: 20,
  customFileCounts: { normal: 10 },
})

const invalidConfigString = JSON.stringify({
  modelName: 'this-is-definitely-not-a-valid-model-name-for-the-enum',
  maxFilesPerRequest: 'not-a-number',
})

describe('getCustomFilePickerConfigForOrg', () => {
  beforeEach(() => {
    mockSelectFn.mockClear()
    mockFromFn.mockClear()
    mockWhereFn.mockClear()
    mockLimitFn.mockClear().mockResolvedValue([])

    getRequestContextSpy = bunSpyOn(
      requestContextModule,
      'getRequestContext'
    ).mockReturnValue({
      approvedOrgIdForRepo: 'org123',
      isRepoApprovedForUserInOrg: true,
    })
  })

  afterEach(() => {
    getRequestContextSpy.mockRestore()
  })

  it('should return null if orgId is undefined', async () => {
    getRequestContextSpy.mockReturnValue({
      approvedOrgIdForRepo: undefined,
      isRepoApprovedForUserInOrg: true,
    })
    const result = await getCustomFilePickerConfigForOrg(undefined, true)
    expect(result).toBeNull()
    expect(mockSelectFn).not.toHaveBeenCalled()
  })

  it('should return null if isRepoApprovedForUserInOrg is false', async () => {
    getRequestContextSpy.mockReturnValue({
      approvedOrgIdForRepo: 'org123',
      isRepoApprovedForUserInOrg: false,
    })
    const result = await getCustomFilePickerConfigForOrg('org123', false)
    expect(result).toBeNull()
    expect(mockSelectFn).not.toHaveBeenCalled()
  })

  it('should return null if isRepoApprovedForUserInOrg is undefined', async () => {
    getRequestContextSpy.mockReturnValue({
      approvedOrgIdForRepo: 'org123',
      isRepoApprovedForUserInOrg: undefined,
    })
    const result = await getCustomFilePickerConfigForOrg('org123', undefined)
    expect(result).toBeNull()
    expect(mockSelectFn).not.toHaveBeenCalled()
  })

  it('should return null if orgFeature is not found', async () => {
    const result = await getCustomFilePickerConfigForOrg('org123', true)
    expect(result).toBeNull()
    expect(mockSelectFn).toHaveBeenCalledTimes(1)
    expect(mockFromFn).toHaveBeenCalledTimes(1)
    expect(mockWhereFn).toHaveBeenCalledTimes(1)
    expect(mockLimitFn).toHaveBeenCalledTimes(1)
  })

  it('should return null if orgFeature has no config', async () => {
    mockLimitFn.mockResolvedValueOnce([{ config: null }])
    const result = await getCustomFilePickerConfigForOrg('org123', true)
    expect(result).toBeNull()
    expect(mockSelectFn).toHaveBeenCalledTimes(1)
  })

  it('should return parsed config if orgFeature has valid config', async () => {
    mockLimitFn.mockResolvedValueOnce([{ config: validConfigString }])
    const result = await getCustomFilePickerConfigForOrg('org123', true)
    const expectedParsedConfig = JSON.parse(validConfigString)
    expect(result).toEqual(expectedParsedConfig)
    expect(mockSelectFn).toHaveBeenCalledTimes(1)
    expect(mockFromFn).toHaveBeenCalledTimes(1)
    expect(mockWhereFn).toHaveBeenCalledTimes(1)
    expect(mockLimitFn).toHaveBeenCalledTimes(1)
  })

  it('should return null and log error if orgFeature has invalid config', async () => {
    mockLimitFn.mockResolvedValueOnce([{ config: invalidConfigString }])

    const result = await getCustomFilePickerConfigForOrg('org123', true)
    expect(result).toBeNull()
  })

  it('should return null and log error if db query fails', async () => {
    mockLimitFn.mockRejectedValueOnce(new Error('DB Error'))

    const result = await getCustomFilePickerConfigForOrg('org123', true)
    expect(result).toBeNull()
  })
})
