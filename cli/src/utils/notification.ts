/**
 * Desktop notification utilities for task completion alerts.
 *
 * On Windows, fires a native toast notification via PowerShell so users who
 * have muted speakers or stepped away still see a visual alert when the
 * agent finishes its work (#1111). On other platforms the function is a
 * no-op — the terminal bell (BEL character in the OSC title sequence) already
 * provides the audible cue.
 *
 * The Desktop (Electron) app can call `notifyTaskComplete` directly; the
 * CLI terminal-app path is best served by the BEL character already embedded
 * in `setTerminalTitle`, so this module is not wired into the CLI streaming
 * flow by default. The Desktop renderer imports and calls it after its own
 * task-completion event.
 */

import { spawn } from 'child_process'

/**
 * Show a Windows toast notification with the given title and body.
 *
 * Uses `urn:github:Electron` as the AUMID so the notification groups under
 * the app icon in the action center. PowerShell's `BurntToast` module is
 * not guaranteed to be installed, so we fall back to a direct .NET call via
 * `powershell -Command` which works on every Windows 10+ machine without
 * extra dependencies.
 */
export function notifyDesktop(title: string, body: string): void {
  if (process.platform !== 'win32') return

  try {
    const ps = [
      '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
      '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null',
      `$template = @"`,
      `<toast launch="action=open" activationType="protocol">`,
      `  <visual>`,
      `    <binding template="ToastGeneric">`,
      `      <text>${escapeXml(title)}</text>`,
      `      <text>${escapeXml(body)}</text>`,
      `    </binding>`,
      `  </visual>`,
      `</toast>`,
      `"@`,
      `$xml = New-Object Windows.Data.Xml.Dom.XmlDocument`,
      `$xml.LoadXml($template)`,
      `$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)`,
      `$toast.Tag = "freebuff-task-complete"`,
      `$toast.Group = "freebuff"`,
      `$toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(5)`,
      `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("freebuff").Show($toast)`,
    ].join('\n')

    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch {
    // Notification is best-effort; never break the user's session over it.
  }
}

/**
 * Convenience wrapper used by the Desktop app after a run completes.
 */
export function notifyTaskComplete(agentName?: string): void {
  const title = agentName ? `${agentName} finished` : 'Task complete'
  const body = agentName
    ? `${agentName} has finished processing your request.`
    : 'Your request has finished processing.'
  notifyDesktop(title, body)
}

/** Escape XML special characters for the PowerShell toast template. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
