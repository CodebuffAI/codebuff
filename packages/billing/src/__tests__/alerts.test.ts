import { jest, describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { getOrganizationAlerts } from '../alerts'
import { OrganizationAlert } from 'common/src/types/organization'
// Import 'mock' from 'bun:test' for Bun's built-in mocking
import { mock } from 'bun:test'

// db, billingCycle, and balanceCalculator will be mocked using mock.module

// Mock Date
const MOCK_NOW = new Date('2024-07-15T10:00:00.000Z')

// Default mock org data
const mockOrgData = {
  id: 'org_test_id',
  name: 'Test Org',
  stripe_subscription_id: 'sub_test123',
  auto_topup_enabled: true,
  auto_topup_threshold: 100, // credits
  auto_topup_amount: 500, // credits
  current_period_start: new Date('2024-07-01T00:00:00.000Z'),
}

// Default mock balance data
const mockBalanceData = {
  balance: {
    netBalance: 500,
    totalDebt: 0,
    totalRemaining: 500,
    principals: {
      purchase: 500,
      organization: 0,
      free: 0,
      referral: 0,
      admin: 0,
    },
    breakdown: {
      purchase: 500,
      organization: 0,
      free: 0,
      referral: 0,
      admin: 0,
    },
  },
  usageThisCycle: 100,
}

// Using Bun's mock.module
mock.module('common/db', () => ({
  __esModule: true,
  default: {
    query: {
      org: {
        findFirst: jest.fn(), // jest.fn from @jest/globals should still work for creating spy functions
      },
    },
  },
}))

mock.module('../billing-cycle', () => ({
  __esModule: true,
  syncOrganizationBillingCycle: jest.fn(),
}))

mock.module('../balance-calculator', () => ({
  __esModule: true,
  calculateOrganizationUsageAndBalance: jest.fn(),
}))

// Now we need to import the mocked modules to access their mocked functions
// These imports must come *after* the mock.module calls.
// To do this cleanly, we might need to dynamically import or structure differently.
// A common pattern is to perform imports inside `beforeEach` or `test` blocks
// if modules are mocked this way, or ensure mocks are configured before any
// top-level import of the module-under-test that might trigger side-effects.

// For simplicity here, we'll rely on Jest's behavior of using the mocked versions.
// We need to access the mocked functions to set their return values.
// Let's get references to the mocked functions.
// This is a bit tricky with mock.module as it replaces the module wholesale.
// A common way is to re-import them or access them via the module cache if possible,
// or ensure the mock factory returns the spy functions in a way they can be accessed.

// A simpler approach for this specific test setup:
// The mock factories already use jest.fn(). We need to ensure these are the
// functions being called. Let's get references to them.
// This requires a bit of a workaround or a different mocking strategy if we need to
// control `mockResolvedValue` outside the factory.
// For now, let's assume the factories are set up and we'll re-import the modules
// to get the mocked versions. This is not ideal but a common pattern.

// To correctly type the re-imported mocks:
let dbMock: { query: { org: { findFirst: jest.Mock } } }
let billingCycleMock: { syncOrganizationBillingCycle: jest.Mock }
let balanceCalculatorMock: { calculateOrganizationUsageAndBalance: jest.Mock }

describe('getOrganizationAlerts', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>

  beforeEach(async () => {
    // Dynamically import the mocked modules to get the correct mock functions
    // This ensures we get the versions replaced by mock.module
    const dbModule = await import('common/db')
    dbMock = dbModule.default as any // Cast to access mocked jest.fn

    const billingCycleModule = await import('../billing-cycle')
    billingCycleMock = billingCycleModule as any

    const balanceCalculatorModule = await import('../balance-calculator')
    balanceCalculatorMock = balanceCalculatorModule as any

    jest.clearAllMocks()

    dbMock.query.org.findFirst.mockResolvedValue(mockOrgData)
    billingCycleMock.syncOrganizationBillingCycle.mockResolvedValue(
      new Date('2024-07-01T00:00:00.000Z')
    )
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      mockBalanceData
    )
  })

  afterEach(() => {
    // Restore console.error after each test
    consoleErrorSpy.mockRestore()
  })

  const findAlertByType = (alerts: OrganizationAlert[], type: string) =>
    alerts.find((a) => a.type === type)

  test('should return no alerts for a healthy organization', async () => {
    const alerts = await getOrganizationAlerts('org_test_id')
    expect(alerts.length).toBe(0)
    expect(consoleErrorSpy).not.toHaveBeenCalled() // Ensure no errors logged for healthy case
  })

  test('should return low_balance alert', async () => {
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      {
        ...mockBalanceData,
        balance: { ...mockBalanceData.balance, netBalance: 150 }, // Below 200 threshold
      }
    )
    const alerts = await getOrganizationAlerts('org_test_id')
    const lowBalanceAlert = findAlertByType(alerts, 'low_balance')
    expect(lowBalanceAlert).toBeDefined()
    expect(lowBalanceAlert?.severity).toBe('warning')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('should return credit_limit_reached alert for zero balance', async () => {
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      {
        ...mockBalanceData,
        balance: { ...mockBalanceData.balance, netBalance: 0 },
      }
    )
    const alerts = await getOrganizationAlerts('org_test_id')
    const criticalAlert = findAlertByType(alerts, 'credit_limit_reached')
    expect(criticalAlert).toBeDefined()
    expect(criticalAlert?.severity).toBe('critical')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('should return credit_limit_reached alert for debt', async () => {
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      {
        ...mockBalanceData,
        balance: { ...mockBalanceData.balance, netBalance: -50, totalDebt: 50 },
      }
    )
    const alerts = await getOrganizationAlerts('org_test_id')
    const criticalAlert = findAlertByType(alerts, 'credit_limit_reached')
    expect(criticalAlert).toBeDefined()
    expect(criticalAlert?.severity).toBe('critical')
    expect(criticalAlert?.message).toContain('debt of 50 credits')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('low_balance alert should not appear if credit_limit_reached is present', async () => {
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      {
        ...mockBalanceData,
        balance: { ...mockBalanceData.balance, netBalance: -50, totalDebt: 50 },
      }
    )
    const alerts = await getOrganizationAlerts('org_test_id')
    expect(findAlertByType(alerts, 'credit_limit_reached')).toBeDefined()
    expect(findAlertByType(alerts, 'low_balance')).toBeUndefined()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('should return high_usage alert', async () => {
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      {
        balance: { ...mockBalanceData.balance, netBalance: 1500 },
        usageThisCycle: 12000,
      }
    )
    const alerts = await getOrganizationAlerts('org_test_id')
    const highUsageAlert = findAlertByType(alerts, 'high_usage')
    expect(highUsageAlert).toBeDefined()
    expect(highUsageAlert?.severity).toBe('warning')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('should return auto_topup_failed (config error) if enabled but no stripe_subscription_id', async () => {
    dbMock.query.org.findFirst.mockResolvedValue({
      ...mockOrgData,
      auto_topup_enabled: true,
      stripe_subscription_id: null,
    })
    const alerts = await getOrganizationAlerts('org_test_id')
    const configErrorAlert = findAlertByType(alerts, 'auto_topup_failed')
    expect(configErrorAlert).toBeDefined()
    expect(configErrorAlert?.severity).toBe('error')
    expect(configErrorAlert?.message).toContain(
      'billing information (subscription) is not fully set up'
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('should return auto_topup_threshold_reached info alert', async () => {
    dbMock.query.org.findFirst.mockResolvedValue({
      ...mockOrgData,
      auto_topup_enabled: true,
      auto_topup_threshold: 100,
      stripe_subscription_id: 'sub_test123',
    })
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      {
        ...mockBalanceData,
        balance: { ...mockBalanceData.balance, netBalance: 120 },
      }
    )
    const alerts = await getOrganizationAlerts('org_test_id')
    const thresholdAlert = findAlertByType(
      alerts,
      'auto_topup_threshold_reached'
    )
    expect(thresholdAlert).toBeDefined()
    expect(thresholdAlert?.severity).toBe('info')
    expect(thresholdAlert?.message).toContain(
      'below the auto top-up threshold of 100 credits'
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('auto_topup_threshold_reached should not appear if auto_topup_failed (config error) is present', async () => {
    dbMock.query.org.findFirst.mockResolvedValue({
      ...mockOrgData,
      auto_topup_enabled: true,
      stripe_subscription_id: null,
      auto_topup_threshold: 100,
    })
    balanceCalculatorMock.calculateOrganizationUsageAndBalance.mockResolvedValue(
      {
        ...mockBalanceData,
        balance: { ...mockBalanceData.balance, netBalance: 120 },
      }
    )
    const alerts = await getOrganizationAlerts('org_test_id')
    expect(findAlertByType(alerts, 'auto_topup_failed')).toBeDefined()
    expect(
      findAlertByType(alerts, 'auto_topup_threshold_reached')
    ).toBeUndefined()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  test('should return system_error alert if db query fails and suppress console.error', async () => {
    // For this specific test, we expect console.error to be called by the function,
    // but we don't want it to pollute the test output.
    // The spy is already set up in beforeEach to suppress it.
    dbMock.query.org.findFirst.mockRejectedValue(new Error('DB error'))
    const alerts = await getOrganizationAlerts('org_test_id')
    const systemErrorAlert = findAlertByType(alerts, 'system_error')
    expect(systemErrorAlert).toBeDefined()
    expect(systemErrorAlert?.severity).toBe('error')
    // We can also assert that our spy was called, confirming the function tried to log.
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Error in getOrganizationAlerts for orgId org_test_id:'
      ),
      expect.any(Error)
    )
  })
})
