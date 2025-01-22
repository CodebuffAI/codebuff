import { platform } from 'os'
import { execSync } from 'child_process'

export function detectShell():
  | 'bash'
  | 'zsh'
  | 'fish'
  | 'cmd.exe'
  | 'powershell'
  | 'unknown'
  | string {
  // Get the parent process environment
  const shell =
    process.env.SHELL || process.env.COMSPEC || process.env.PSModulePath

  try {
    // Handle Windows detection
    if (platform() === 'win32') {
      try {
        // Check if running in PowerShell
        execSync('$PSVersionTable', { stdio: 'pipe' })
        return 'powershell'
      } catch {
        // Check explicit CMD environment
        if (process.env.COMSPEC?.toLowerCase().includes('cmd.exe')) {
          return 'cmd.exe'
        }

        // Check parent process as final Windows check
        const parentProcess = execSync(
          'wmic process get ParentProcessId,CommandLine',
          { stdio: 'pipe' }
        )
          .toString()
          .toLowerCase()
        if (parentProcess.includes('powershell')) return 'powershell'
        if (parentProcess.includes('cmd.exe')) return 'cmd.exe'
      }
    }

    // Handle Unix-like systems
    if (shell) {
      const shellLower = shell.toLowerCase()
      if (shellLower.includes('bash')) return 'bash'
      if (shellLower.includes('zsh')) return 'zsh'
      if (shellLower.includes('fish')) return 'fish'
    }

    // Try to get the parent process name on Unix systems
    if (platform() !== 'win32') {
      const ppid = process.ppid
      const parentProcess = execSync(`ps -p ${ppid} -o comm=`, {
        stdio: 'pipe',
      })
        .toString()
        .trim()
      if (parentProcess) return parentProcess
    }
  } catch (error) {
    // Log error if needed
    // console.error('Error detecting shell:', error);
  }

  return 'unknown'
}
