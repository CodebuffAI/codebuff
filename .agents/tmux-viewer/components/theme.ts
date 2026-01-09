/**
 * Simple theme for the tmux viewer
 * Uses a minimal set of semantic colors
 */

export interface ViewerTheme {
  foreground: string
  muted: string
  primary: string
  success: string
  error: string
  warning: string
  border: string
  surface: string
  surfaceHover: string
}

export const darkTheme: ViewerTheme = {
  foreground: '#e4e4e7',
  muted: '#71717a',
  primary: '#3b82f6',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  border: '#3f3f46',
  surface: '#18181b',
  surfaceHover: '#27272a',
}

export const lightTheme: ViewerTheme = {
  foreground: '#18181b',
  muted: '#71717a',
  primary: '#2563eb',
  success: '#16a34a',
  error: '#dc2626',
  warning: '#d97706',
  border: '#d4d4d8',
  surface: '#fafafa',
  surfaceHover: '#f4f4f5',
}

export function getTheme(): ViewerTheme {
  // Simple detection based on COLORTERM or default to dark
  const colorTerm = process.env.COLORTERM ?? ''
  const term = process.env.TERM ?? ''
  
  // Most terminals are dark by default, so we default to dark
  // This is a simple heuristic - a more robust solution would use OSC detection
  if (colorTerm.includes('light') || term.includes('light')) {
    return lightTheme
  }
  
  return darkTheme
}
