/**
 * Enum of analytics event types used throughout the application
 */
export enum AnalyticsEvent {
  // CLI
  APP_LAUNCHED = 'cli.app_launched',
  BACKGROUND_PROCESS_STARTED = 'cli.background_process_started',
  LOGIN = 'cli.login',

  // Backend
  PROMPT_SENT = 'backend.prompt_sent',
}
