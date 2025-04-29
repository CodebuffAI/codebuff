/**
 * Enum of analytics event types used throughout the application
 */
export enum AnalyticsEvent {
  // CLI
  APP_LAUNCHED = 'cli.app_launched',
  BACKGROUND_PROCESS_CONTINUE = 'cli.background_process_continue',
  BACKGROUND_PROCESS_END = 'cli.background_process_end',
  BACKGROUND_PROCESS_LEFTOVER_DETECTED = 'cli.background_process_leftover_detected',
  BACKGROUND_PROCESS_START = 'cli.background_process_start',
  LOGIN = 'cli.login',
  CHECKPOINT_COMMAND_USED = 'cli.checkpoint_command_used',
  TERMINAL_COMMAND_COMPLETED = 'cli.terminal_command_completed',

  // Backend
  PROMPT_SENT = 'backend.prompt_sent',
  CREDIT_GRANT = 'backend.credit_grant',
  CREDIT_CONSUMED = 'backend.credit_consumed',
  TOOL_USE = 'backend.tool_use',

  // Web
  SIGNUP = 'web.signup',
}
