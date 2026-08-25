import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

import { getBundledRgPath } from '@codebuff/sdk'
import { env } from '@codebuff/common/env'

import { getCliEnv } from '../utils/env'
import { IS_FREEBUFF } from '../utils/constants'

export type HealthStatus = 'ok' | 'warn' | 'error'

export type DiagnosticItem = {
  category: string
  name: string
  status: HealthStatus
  message: string
  detail?: string
}

export type DoctorReport = {
  product: string
  version: string
  items: DiagnosticItem[]
  timestamp: string
}

function runCmd(
  cmd: string,
  args: string[],
  cwd?: string,
): { stdout: string; stderr: string; status: number | null } {
  try {
    const result = spawnSync(cmd, args, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
    })
    return {
      stdout: (result.stdout ?? '').trim(),
      stderr: (result.stderr ?? '').trim(),
      status: result.status,
    }
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      status: -1,
    }
  }
}

export function checkRuntime(): DiagnosticItem {
  const runtimeName =
    typeof Bun !== 'undefined'
      ? `Bun ${Bun.version}`
      : `${process.release.name} ${process.version}`
  const platform = `${process.platform} (${process.arch})`

  return {
    category: 'Runtime',
    name: 'Engine & OS',
    status: 'ok',
    message: `${runtimeName} on ${platform}`,
  }
}

export function checkGit(cwd?: string): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  const versionResult = runCmd('git', ['--version'], cwd)
  if (versionResult.status !== 0 || !versionResult.stdout) {
    items.push({
      category: 'Git',
      name: 'Git Binary',
      status: 'warn',
      message: 'Git is not installed or not in PATH',
      detail: 'Git is recommended for version control and change tracking',
    })
    return items
  }

  items.push({
    category: 'Git',
    name: 'Git Binary',
    status: 'ok',
    message: versionResult.stdout,
  })

  const repoCheck = runCmd('git', ['rev-parse', '--is-inside-work-tree'], cwd)
  if (repoCheck.status === 0 && repoCheck.stdout === 'true') {
    const branchCheck = runCmd('git', ['branch', '--show-current'], cwd)
    const branch = branchCheck.stdout || 'detached HEAD'
    items.push({
      category: 'Git',
      name: 'Repository',
      status: 'ok',
      message: `Active Git repo (branch: ${branch})`,
    })
  } else {
    items.push({
      category: 'Git',
      name: 'Repository',
      status: 'warn',
      message: 'Current directory is not a Git repository',
    })
  }

  return items
}

export function checkRipgrep(): DiagnosticItem {
  try {
    const bundledPath = getBundledRgPath()
    if (bundledPath && existsSync(bundledPath)) {
      const rgVersion = runCmd(bundledPath, ['--version'])
      const firstLine = rgVersion.stdout.split('\n')[0] ?? 'ripgrep'
      return {
        category: 'Search',
        name: 'Ripgrep (rg)',
        status: 'ok',
        message: `Bundled binary functional (${firstLine})`,
      }
    }
  } catch {
    // Fall back to system ripgrep check
  }

  const sysRg = runCmd('rg', ['--version'])
  if (sysRg.status === 0 && sysRg.stdout) {
    const firstLine = sysRg.stdout.split('\n')[0] ?? 'ripgrep'
    return {
      category: 'Search',
      name: 'Ripgrep (rg)',
      status: 'ok',
      message: `System binary found (${firstLine})`,
    }
  }

  return {
    category: 'Search',
    name: 'Ripgrep (rg)',
    status: 'error',
    message: 'Ripgrep binary not found',
    detail: 'Fast code search will not be available without ripgrep',
  }
}

export function checkTmux(): DiagnosticItem {
  const result = runCmd('tmux', ['-V'])
  if (result.status === 0 && result.stdout) {
    return {
      category: 'Terminal',
      name: 'Tmux',
      status: 'ok',
      message: result.stdout,
    }
  }

  return {
    category: 'Terminal',
    name: 'Tmux',
    status: 'warn',
    message: 'Tmux not installed (optional)',
    detail: 'Tmux enables detached sessions and advanced terminal multiplexing',
  }
}

export async function checkNetwork(): Promise<DiagnosticItem> {
  const targetUrl =
    (IS_FREEBUFF
      ? env.NEXT_PUBLIC_FREEBUFF_APP_URL
      : env.NEXT_PUBLIC_CODEBUFF_APP_URL) ||
    env.NEXT_PUBLIC_CODEBUFF_APP_URL ||
    'https://freebuff.com'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    return {
      category: 'Network',
      name: 'API Endpoint',
      status: 'ok',
      message: `Connected to ${targetUrl} (HTTP ${res.status})`,
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error && error.name === 'AbortError'
        ? 'Connection timed out'
        : error instanceof Error
          ? error.message
          : 'Failed to reach API endpoint'

    return {
      category: 'Network',
      name: 'API Endpoint',
      status: 'warn',
      message: `Could not reach ${targetUrl}`,
      detail: errorMsg,
    }
  }
}

export async function collectDoctorDiagnostics(
  cwd?: string,
): Promise<DoctorReport> {
  const product = IS_FREEBUFF ? 'Freebuff' : 'Codebuff'
  const version = getCliEnv().CODEBUFF_CLI_VERSION ?? 'dev'

  const items: DiagnosticItem[] = [
    checkRuntime(),
    ...checkGit(cwd),
    checkRipgrep(),
    checkTmux(),
    await checkNetwork(),
  ]

  return {
    product,
    version,
    items,
    timestamp: new Date().toISOString(),
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  const statusIcon = (status: HealthStatus) => {
    switch (status) {
      case 'ok':
        return '✓'
      case 'warn':
        return '!'
      case 'error':
        return '✗'
    }
  }

  const lines = [
    `### ${report.product} v${report.version} Environment Doctor`,
    '',
  ]

  let currentCategory = ''
  for (const item of report.items) {
    if (item.category !== currentCategory) {
      currentCategory = item.category
      lines.push(`**${currentCategory}:**`)
    }
    const icon = statusIcon(item.status)
    lines.push(`- [${icon}] ${item.name}: ${item.message}`)
    if (item.detail) {
      lines.push(`  ↳ *${item.detail}*`)
    }
  }

  const errors = report.items.filter((i) => i.status === 'error').length
  const warnings = report.items.filter((i) => i.status === 'warn').length

  lines.push('')
  if (errors === 0 && warnings === 0) {
    lines.push('All checks passed! Your environment is in great shape.')
  } else if (errors === 0) {
    lines.push(
      `✓ Core environment is ready (${warnings} optional notice${warnings > 1 ? 's' : ''}).`,
    )
  } else {
    lines.push(
      `⚠️ Found ${errors} error${errors > 1 ? 's' : ''} and ${warnings} warning${warnings > 1 ? 's' : ''}. Check details above.`,
    )
  }

  return lines.join('\n')
}
