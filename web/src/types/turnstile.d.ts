interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'error-callback'?: (errorCode: string) => void
  'expired-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'flexible' | 'compact'
  action?: string
  execution?: 'render' | 'execute'
  appearance?: 'always' | 'execute' | 'interaction-only'
}

interface TurnstileInstance {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
  getResponse: (widgetId: string) => string | undefined
  isExpired: (widgetId: string) => boolean
  ready: (callback: () => void) => void
  execute: (container: HTMLElement | string) => void
}

interface Window {
  turnstile?: TurnstileInstance
}
