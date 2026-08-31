import { describe, expect, test, mock, afterEach, beforeEach } from 'bun:test'

import { collectDoctorReport, formatDoctorReport } from '../doctor'

// Mock fetch to avoid network calls in tests
const originalFetch = globalThis.fetch

describe('/doctor command', () => {
  beforeEach(() => {
    // Mock fetch to return a successful response
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      })
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch
  })

  test('collectDoctorReport returns a valid report', async () => {
    const report = await collectDoctorReport()
    
    expect(report).toBeDefined()
    expect(report.product).toBeDefined()
    expect(report.results).toBeInstanceOf(Array)
    expect(report.results.length).toBeGreaterThan(0)
    expect(report.summary).toBeDefined()
    expect(report.summary.ok).toBeDefined()
    expect(report.summary.warnings).toBeDefined()
    expect(report.summary.errors).toBeDefined()
  })

  test('collectDoctorReport includes platform check', async () => {
    const report = await collectDoctorReport()
    
    const platformCheck = report.results.find((r) => r.name === 'platform')
    expect(platformCheck).toBeDefined()
    expect(platformCheck!.status).toBe('ok')
  })

  test('collectDoctorReport includes runtime check', async () => {
    const report = await collectDoctorReport()
    
    const runtimeCheck = report.results.find((r) => r.name === 'runtime')
    expect(runtimeCheck).toBeDefined()
    expect(runtimeCheck!.status).toBe('ok')
  })

  test('collectDoctorReport includes connectivity check', async () => {
    const report = await collectDoctorReport()
    
    const connectivityCheck = report.results.find((r) => r.name === 'API connectivity')
    expect(connectivityCheck).toBeDefined()
    expect(connectivityCheck!.status).toBe('ok')
  })

  test('formatDoctorReport returns a string', async () => {
    const report = await collectDoctorReport()
    const formatted = formatDoctorReport(report)
    
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(0)
  })

  test('formatDoctorReport includes product name', async () => {
    const report = await collectDoctorReport()
    const formatted = formatDoctorReport(report)
    
    expect(formatted).toContain(report.product)
    expect(formatted).toContain('doctor')
  })

  test('formatDoctorReport includes summary icon', async () => {
    const report = await collectDoctorReport()
    const formatted = formatDoctorReport(report)
    
    // Should contain either ✅, ⚠️, or ❌
    expect(formatted).toMatch(/[✅⚠️❌]/)
  })

  test('handles connectivity failure gracefully', async () => {
    // Mock fetch to return a failed response
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
      })
    ) as unknown as typeof fetch

    const report = await collectDoctorReport()
    const connectivityCheck = report.results.find((r) => r.name === 'API connectivity')
    
    expect(connectivityCheck).toBeDefined()
    expect(connectivityCheck!.status).toBe('warning')
    expect(connectivityCheck!.message).toContain('status 500')
  })

  test('handles network error gracefully', async () => {
    // Mock fetch to throw an error
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network error'))
    ) as unknown as typeof fetch

    const report = await collectDoctorReport()
    const connectivityCheck = report.results.find((r) => r.name === 'API connectivity')
    
    expect(connectivityCheck).toBeDefined()
    expect(connectivityCheck!.status).toBe('error')
    expect(connectivityCheck!.message).toBe('Failed to connect')
  })
})
