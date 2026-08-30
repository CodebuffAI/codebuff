import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

import { IS_FREEBUFF } from '../utils/constants'
import { getWebsiteUrl } from '@codebuff/sdk'

export type DiagnosticResult = {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  details?: string
}

export type DoctorReport = {
  product: string
  results: DiagnosticResult[]
  summary: {
    ok: number
    warnings: number
    errors: number
  }
}

/**
 * Check if a command is available in PATH
 */
function isCommandAvailable(command: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which'
    execSync(`${which} ${command}`, { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * Check if ripgrep (rg) is available and executable
 */
function checkRipgrep(): DiagnosticResult {
  const rgAvailable = isCommandAvailable('rg')
  
  if (!rgAvailable) {
    return {
      name: 'ripgrep (rg)',
      status: 'error',
      message: 'ripgrep not found in PATH',
      details: 'Code search requires ripgrep. Install it:\n  - macOS: brew install ripgrep\n  - Ubuntu/Debian: sudo apt install ripgrep\n  - Windows: scoop install ripgrep',
    }
  }

  return {
    name: 'ripgrep (rg)',
    status: 'ok',
    message: 'Available',
  }
}

/**
 * Check git availability and repository status
 */
function checkGit(): DiagnosticResult[] {
  const results: DiagnosticResult[] = []

  // Check git availability
  const gitAvailable = isCommandAvailable('git')
  if (!gitAvailable) {
    results.push({
      name: 'git',
      status: 'error',
      message: 'git not found in PATH',
      details: 'Git is required for version control features. Install it:\n  - macOS: xcode-select --install\n  - Ubuntu/Debian: sudo apt install git\n  - Windows: https://git-scm.com/download/win',
    })
    return results
  }

  results.push({
    name: 'git',
    status: 'ok',
    message: 'Available',
  })

  // Check if we're in a git repository
  try {
    execSync('git rev-parse --is-inside-work-tree', { 
      stdio: 'ignore', 
      timeout: 5000,
      cwd: process.cwd() 
    })
    results.push({
      name: 'git repository',
      status: 'ok',
      message: 'Current directory is a git repository',
    })
  } catch {
    results.push({
      name: 'git repository',
      status: 'warning',
      message: 'Current directory is not a git repository',
      details: 'Some features may not work correctly outside a git repository.',
    })
  }

  return results
}

/**
 * Check API connectivity
 */
async function checkConnectivity(): Promise<DiagnosticResult> {
  const websiteUrl = getWebsiteUrl()
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`${websiteUrl}/api/healthz`, {
      method: 'GET',
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (response.ok) {
      return {
        name: 'API connectivity',
        status: 'ok',
        message: `Connected to ${websiteUrl}`,
      }
    } else {
      return {
        name: 'API connectivity',
        status: 'warning',
        message: `API responded with status ${response.status}`,
        details: 'The API is reachable but returned an error. This may indicate a temporary issue.',
      }
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    return {
      name: 'API connectivity',
      status: 'error',
      message: isTimeout ? 'Connection timed out' : 'Failed to connect',
      details: `Could not reach ${websiteUrl}. Check your internet connection and firewall settings.`,
    }
  }
}

/**
 * Check if tmux is available
 */
function checkTmux(): DiagnosticResult {
  const tmuxAvailable = isCommandAvailable('tmux')
  
  if (!tmuxAvailable) {
    return {
      name: 'tmux',
      status: 'warning',
      message: 'tmux not found',
      details: 'tmux is optional but recommended for multiplexing and detached sessions. Install it:\n  - macOS: brew install tmux\n  - Ubuntu/Debian: sudo apt install tmux\n  - Windows: Available through WSL',
    }
  }

  return {
    name: 'tmux',
    status: 'ok',
    message: 'Available',
  }
}

/**
 * Check Node.js/Bun runtime
 */
function checkRuntime(): DiagnosticResult {
  if (typeof Bun !== 'undefined') {
    return {
      name: 'runtime',
      status: 'ok',
      message: `Bun ${Bun.version}`,
    }
  }
  
  return {
    name: 'runtime',
    status: 'ok',
    message: `Node.js ${process.version}`,
  }
}

/**
 * Check platform and architecture
 */
function checkPlatform(): DiagnosticResult {
  return {
    name: 'platform',
    status: 'ok',
    message: `${process.platform} ${process.arch}`,
  }
}

/**
 * Collect all diagnostic information
 */
export async function collectDoctorReport(): Promise<DoctorReport> {
  const results: DiagnosticResult[] = []

  // Add basic info
  results.push(checkPlatform())
  results.push(checkRuntime())
  
  // Check dependencies
  results.push(checkRipgrep())
  results.push(...checkGit())
  results.push(checkTmux())
  
  // Check connectivity (async)
  const connectivity = await checkConnectivity()
  results.push(connectivity)

  // Calculate summary
  const summary = {
    ok: results.filter((r) => r.status === 'ok').length,
    warnings: results.filter((r) => r.status === 'warning').length,
    errors: results.filter((r) => r.status === 'error').length,
  }

  return {
    product: IS_FREEBUFF ? 'Freebuff' : 'Codebuff',
    results,
    summary,
  }
}

/**
 * Format the doctor report for display
 */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = []

  lines.push(`### ${report.product} doctor`)
  lines.push('')

  // Summary
  const { ok, warnings, errors } = report.summary
  if (errors === 0 && warnings === 0) {
    lines.push('✅ All checks passed!')
  } else if (errors === 0) {
    lines.push(`⚠️ ${warnings} warning(s) found`)
  } else {
    lines.push(`❌ ${errors} error(s), ${warnings} warning(s) found`)
  }
  lines.push('')

  // Detailed results
  for (const result of report.results) {
    const icon = result.status === 'ok' ? '✅' : result.status === 'warning' ? '⚠️' : '❌'
    lines.push(`${icon} **${result.name}**: ${result.message}`)
    if (result.details) {
      // Indent details
      const detailLines = result.details.split('\n')
      for (const line of detailLines) {
        lines.push(`   ${line}`)
      }
    }
  }

  lines.push('')
  
  // Recommendations
  if (errors > 0) {
    lines.push('### Recommendations')
    lines.push('')
    lines.push('Fix the errors above to ensure full functionality.')
  } else if (warnings > 0) {
    lines.push('### Notes')
    lines.push('')
    lines.push('The warnings above are optional but may improve your experience.')
  }

  return lines.join('\n')
}
