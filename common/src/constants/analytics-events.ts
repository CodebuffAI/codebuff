/**
 * Enum of analytics event types used throughout the application
 */
export enum AnalyticsEvent {
  // CLI
  APP_LAUNCHED = 'cli.app_launched',
  APP_HUNG = 'cli.app_hung',
  BACKGROUND_PROCESS_CONTINUE = 'cli.background_process_continue',
  BACKGROUND_PROCESS_END = 'cli.background_process_end',
  BACKGROUND_PROCESS_LEFTOVER_DETECTED = 'cli.background_process_leftover_detected',
  BACKGROUND_PROCESS_START = 'cli.background_process_start',
  CHANGE_DIRECTORY = 'cli.change_directory',
  CHECKPOINT_COMMAND_USED = 'cli.checkpoint_command_used',
  INVALID_COMMAND = 'cli.invalid_command',
  KNOWLEDGE_FILE_UPDATED = 'cli.knowledge_file_updated',
  LOGIN = 'cli.login',
  MALFORMED_PROMPT_RESPONSE = 'cli.malformed_prompt_response',
  RAGE = 'cli.rage',
  SHELL_RECREATED = 'cli.shell_recreated',
  SLASH_MENU_ACTIVATED = 'cli.slash_menu_activated',
  SLASH_COMMAND_USED = 'cli.slash_command_used',
  TERMINAL_COMMAND_COMPLETED = 'cli.terminal_command_completed',
  TERMINAL_COMMAND_COMPLETED_SINGLE = 'cli.terminal_command_completed_single',
  USER_INPUT_COMPLETE = 'cli.user_input_complete',
  UPDATE_CODEBUFF_FAILED = 'cli.update_codebuff_failed',

  // Backend
  USER_INPUT = 'backend.user_input',
  AGENT_STEP = 'backend.agent_step',
  CREDIT_GRANT = 'backend.credit_grant',
  CREDIT_CONSUMED = 'backend.credit_consumed',
  TOOL_USE = 'backend.tool_use',

  // Web
  SIGNUP = 'web.signup',

  // Common
  FLUSH_FAILED = 'common.flush_failed',
}
