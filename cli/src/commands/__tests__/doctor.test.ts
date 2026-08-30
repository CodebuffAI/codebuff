import { describe, expect, test, mock, afterEach } from 'bun:test'

import { collectDoctorReport, formatDoctorReport } from '../doctor'

describe('/doctor command', () => {
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
})
