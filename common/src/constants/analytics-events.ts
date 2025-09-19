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
  PRINT_MODE = 'cli.print_mode',
  RAGE = 'cli.rage',
  SHELL_RECREATED = 'cli.shell_recreated',
  SLASH_MENU_ACTIVATED = 'cli.slash_menu_activated',
  SLASH_COMMAND_USED = 'cli.slash_command_used',
  TERMINAL_COMMAND_COMPLETED = 'cli.terminal_command_completed',
  TERMINAL_COMMAND_COMPLETED_SINGLE = 'cli.terminal_command_completed_single',
  USER_INPUT_COMPLETE = 'cli.user_input_complete',
  UPDATE_CODEBUFF_FAILED = 'cli.update_codebuff_failed',

  // Backend
  AGENT_STEP = 'backend.agent_step',
  CREDIT_GRANT = 'backend.credit_grant',
  CREDIT_CONSUMED = 'backend.credit_consumed',
  MALFORMED_TOOL_CALL_JSON = 'backend.malformed_tool_call_json',
  TOOL_USE = 'backend.tool_use',
  UNKNOWN_TOOL_CALL = 'backend.unknown_tool_call',
  USER_INPUT = 'backend.user_input',

  // Web
  SIGNUP = 'web.signup',

  // Web - Authentication
  AUTH_LOGIN_STARTED = 'auth.login_started',
  AUTH_REFERRAL_GITHUB_LOGIN_STARTED = 'auth.referral_github_login_started',
  AUTH_LOGOUT_COMPLETED = 'auth.logout_completed',

  // Web - Cookie Consent
  COOKIE_CONSENT_ACCEPTED = 'cookie_consent.accepted',
  COOKIE_CONSENT_DECLINED = 'cookie_consent.declined',

  // Web - Onboarding
  ONBOARDING_STEP_COMPLETED = 'onboarding_step_completed',
  ONBOARDING_STEP_VIEWED = 'onboarding_step_viewed',
  ONBOARDING_PM_SELECTED = 'onboarding_pm_selected',
  ONBOARDING_EDITOR_OPENED = 'onboarding_editor_opened',

  // Web - Onboard Page
  ONBOARD_PAGE_CD_COMMAND_COPIED = 'onboard_page.cd_command_copied',
  ONBOARD_PAGE_RUN_COMMAND_COPIED = 'onboard_page.run_command_copied',
  ONBOARD_PAGE_INSTALL_COMMAND_COPIED = 'onboard_page.install_command_copied',

  // Web - Install Dialog
  INSTALL_DIALOG_CD_COMMAND_COPIED = 'install_dialog.cd_command_copied',
  INSTALL_DIALOG_RUN_COMMAND_COPIED = 'install_dialog.run_command_copied',
  INSTALL_DIALOG_INSTALL_COMMAND_COPIED = 'install_dialog.install_command_copied',

  // Web - Home Page
  HOME_FEATURE_LEARN_MORE_CLICKED = 'home.feature_learn_more_clicked',
  HOME_INSTALL_COMMAND_COPIED = 'home.install_command_copied',
  HOME_TRY_FREE_CLICKED = 'home.try_free_clicked',
  HOME_TESTIMONIAL_CLICKED = 'home.testimonial_clicked',
  HOME_CTA_INSTALL_GUIDE_CLICKED = 'home.cta_install_guide_clicked',
  HOME_COMPETITION_TAB_CHANGED = 'home.competition_tab_changed',

  // Web - Demo Terminal
  DEMO_TERMINAL_COMMAND_EXECUTED = 'demo_terminal.command_executed',
  DEMO_TERMINAL_HELP_VIEWED = 'demo_terminal.help_viewed',
  DEMO_TERMINAL_OPTIMIZE_REQUESTED = 'demo_terminal.optimize_requested',
  DEMO_TERMINAL_FIX_MEMORY_LEAK = 'demo_terminal.fix_memory_leak',
  DEMO_TERMINAL_REFACTOR_REQUESTED = 'demo_terminal.refactor_requested',
  DEMO_TERMINAL_FEATURE_REQUESTED = 'demo_terminal.feature_requested',
  DEMO_TERMINAL_THEME_CHANGED = 'demo_terminal.theme_changed',

  // Web - UI Components
  TOAST_SHOWN = 'toast.shown',
  REFERRAL_BANNER_CLICKED = 'referral_banner.clicked',

  // Common
  FLUSH_FAILED = 'common.flush_failed',
}
