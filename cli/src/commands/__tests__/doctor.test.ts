import { describe, expect, test } from 'bun:test'

import {
  checkGit,
  checkRipgrep,
  checkRuntime,
  checkTmux,
  collectDoctorDiagnostics,
  formatDoctorReport,
} from '../doctor'
import { findCommand } from '../command-registry'

import type { DoctorReport } from '../doctor'

const mockReport: DoctorReport = {
  product: 'Freebuff',
  version: '0.0.0-dev',
  timestamp: '2026-08-25T12:00:00.000Z',
  items: [
    {
      category: 'Runtime',
      name: 'Engine & OS',
      status: 'ok',
      message: 'Bun 1.4.0 on linux (x64)',
    },
    {
      category: 'Git',
      name: 'Git Binary',
      status: 'ok',
      message: 'git version 2.43.0',
    },
    {
      category: 'Git',
      name: 'Repository',
      status: 'ok',
      message: 'Active Git repo (branch: main)',
    },
    {
      category: 'Search',
      name: 'Ripgrep (rg)',
      status: 'ok',
      message: 'Bundled binary functional (ripgrep 14.1.0)',
    },
    {
      category: 'Terminal',
      name: 'Tmux',
      status: 'ok',
      message: 'tmux 3.4',
    },
    {
      category: 'Network',
      name: 'API Endpoint',
      status: 'ok',
      message: 'Connected to https://freebuff.com (HTTP 200)',
    },
  ],
}

describe('doctor diagnostics', () => {
  test('checkRuntime returns valid engine and OS diagnostic', () => {
    const runtime = checkRuntime()
    expect(runtime.category).toBe('Runtime')
    expect(runtime.name).toBe('Engine & OS')
    expect(runtime.status).toBe('ok')
    expect(runtime.message).toContain(process.platform)
  })

  test('checkGit inspects git binary and repository state', () => {
    const gitItems = checkGit()
    expect(gitItems.length).toBeGreaterThanOrEqual(1)
    expect(gitItems[0].category).toBe('Git')
    expect(gitItems[0].status).toBe('ok')
  })

  test('checkRipgrep resolves ripgrep executable', () => {
    const rgItem = checkRipgrep()
    expect(rgItem.category).toBe('Search')
    expect(rgItem.name).toBe('Ripgrep (rg)')
    expect(['ok', 'warn', 'error']).toContain(rgItem.status)
  })

  test('checkTmux checks tmux availability', () => {
    const tmuxItem = checkTmux()
    expect(tmuxItem.category).toBe('Terminal')
    expect(tmuxItem.name).toBe('Tmux')
    expect(['ok', 'warn']).toContain(tmuxItem.status)
  })

  test('collectDoctorDiagnostics returns complete report', async () => {
    const report = await collectDoctorDiagnostics()
    expect(report.product).toBeDefined()
    expect(report.version).toBeDefined()
    expect(report.items.length).toBeGreaterThanOrEqual(5)
    expect(report.items.some((i) => i.category === 'Runtime')).toBe(true)
    expect(report.items.some((i) => i.category === 'Git')).toBe(true)
    expect(report.items.some((i) => i.category === 'Search')).toBe(true)
    expect(report.items.some((i) => i.category === 'Network')).toBe(true)
  })

  test('formatDoctorReport formats report with markdown styling and indicators', () => {
    const formatted = formatDoctorReport(mockReport)

    expect(formatted).toContain('### Freebuff v0.0.0-dev Environment Doctor')
    expect(formatted).toContain('**Runtime:**')
    expect(formatted).toContain('[✓] Engine & OS: Bun 1.4.0 on linux (x64)')
    expect(formatted).toContain('**Git:**')
    expect(formatted).toContain('[✓] Git Binary: git version 2.43.0')
    expect(formatted).toContain('[✓] Repository: Active Git repo (branch: main)')
    expect(formatted).toContain('**Search:**')
    expect(formatted).toContain('[✓] Ripgrep (rg): Bundled binary functional')
    expect(formatted).toContain('**Network:**')
    expect(formatted).toContain('All checks passed!')
  })

  test('formatDoctorReport formats warning notices correctly', () => {
    const reportWithWarning: DoctorReport = {
      ...mockReport,
      items: [
        ...mockReport.items.slice(0, 4),
        {
          category: 'Terminal',
          name: 'Tmux',
          status: 'warn',
          message: 'Tmux not installed (optional)',
          detail: 'Tmux enables detached sessions',
        },
      ],
    }

    const formatted = formatDoctorReport(reportWithWarning)
    expect(formatted).toContain('[!] Tmux: Tmux not installed (optional)')
    expect(formatted).toContain('↳ *Tmux enables detached sessions*')
    expect(formatted).toContain('Core environment is ready (1 optional notice)')
  })

  test('resolves /doctor command and aliases from command registry', () => {
    const doctorCmd = findCommand('doctor')
    expect(doctorCmd).toBeDefined()
    expect(doctorCmd?.name).toBe('doctor')
    expect(doctorCmd?.aliases).toContain('health')
    expect(doctorCmd?.aliases).toContain('check')

    const healthAlias = findCommand('health')
    expect(healthAlias).toBeDefined()
    expect(healthAlias?.name).toBe('doctor')

    const checkAlias = findCommand('check')
    expect(checkAlias).toBeDefined()
    expect(checkAlias?.name).toBe('doctor')
  })
})
