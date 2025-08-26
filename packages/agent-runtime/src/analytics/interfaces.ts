/**
 * Analytics environment for tracking events and traces (optional)
 */
export interface AnalyticsEnvironment {
  /**
   * Track an analytics event
   */
  trackEvent?: (event: string, userId: string, props: Record<string, any>) => void

  /**
   * Insert a trace record
   */
  insertTrace?: (trace: any) => void
}

/**
 * Logger environment interface
 */
export interface LoggerEnvironment {
  debug: (data: any, message?: string) => void
  info: (data: any, message?: string) => void
  warn: (data: any, message?: string) => void
  error: (data: any, message?: string) => void
}
