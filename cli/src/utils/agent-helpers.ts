import type { AgentContentBlock } from '../types/chat'

export interface StatusInfo {
  indicator: string
  label: string
  color: string
  text: string
}

/** Get status indicator, label, color, and formatted text based on agent status */
export function getAgentStatusInfo(
  status: AgentContentBlock['status'],
  theme: { primary: string; foreground: string; muted: string },
): StatusInfo {
  switch (status) {
    case 'running':
      return { indicator: '●', label: 'running', color: theme.primary, text: '● running' }
    case 'failed':
      return { indicator: '✗', label: 'failed', color: 'red', text: '✗ failed' }
    case 'complete':
      return { indicator: '✓', label: 'completed', color: theme.foreground, text: 'completed ✓' }
    default:
      return { indicator: '○', label: 'waiting', color: theme.muted, text: '○ waiting' }
  }
}
