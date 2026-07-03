/**
 * Enum of analytics event types used throughout the application
 */
export enum AnalyticsEvent {
  // Cross-surface — DAU
  // Emitted exactly once per user-submitted message/prompt, on each surface,
  // and never sampled. `distinct_id` is the canonical codebuff Postgres user
  // id on every surface, so unique-users of this event gives accurate
  // per-surface DAU (filter on the `surface` property) and a combined DAU (no
  // filter). The `surface` property is one of: cli, web, chat, desktop, cloud
  // (web = the freebuff.com builder, cloud = connected-repo builder projects).
  // Emission points: cli client analytics; chat's stream route (server-side);
  // desktop's analytics module; web/cloud via the Convex send mutation
  // (PostHog + Axiom, both direct from Convex — see convex/analytics.ts).
  MESSAGE_SENT = 'message_sent',

  // Cross-surface — engaged time
  // Emitted once per minute of *active engagement* on each surface (cli / web /
  // chat / cloud / desktop) while the user is present (visible+focused for
  // browser surfaces, recently-active for the CLI) and not idle. Never sampled.
  // `distinct_id` is the canonical user id where available (anonymous/device id
  // otherwise). Because interval = 1 minute, a raw event COUNT equals minutes
  // spent: sum per product = Total count broken down by `surface`; average per
  // user = "Average count per user" broken down by `surface`. See
  // common/src/util/engagement-tracker.ts.
  PRODUCT_ACTIVE_MINUTE = 'product_active_minute',

  // CLI
  APP_LAUNCHED = 'cli.app_launched',
  FINGERPRINT_GENERATED = 'cli.fingerprint_generated',
  CHANGE_DIRECTORY = 'cli.change_directory',
  INVALID_COMMAND = 'cli.invalid_command',
  KNOWLEDGE_FILE_UPDATED = 'cli.knowledge_file_updated',
  LOGIN = 'cli.login',
  // Login funnel — the path between launch and a successful `cli.login`.
  // Emitted from login-flow.ts (the chokepoint both the modal and the
  // `login` command share); all tagged with `via` (modal | plain_command).
  LOGIN_STARTED = 'cli.login_started',
  LOGIN_FAILED = 'cli.login_failed',
  LOGIN_TIMEOUT = 'cli.login_timeout',
  LOGIN_ABORTED = 'cli.login_aborted',
  SLASH_MENU_ACTIVATED = 'cli.slash_menu_activated',
  SLASH_COMMAND_USED = 'cli.slash_command_used',
  TERMINAL_COMMAND_COMPLETED = 'cli.terminal_command_completed',
  USER_INPUT_COMPLETE = 'cli.user_input_complete',
  UPDATE_CODEBUFF_FAILED = 'cli.update_codebuff_failed',
  FEEDBACK_BUTTON_HOVERED = 'cli.feedback_button_hovered',
  FOLLOWUP_CLICKED = 'cli.followup_clicked',
  SUGGESTED_PROMPT_SHOWN = 'cli.suggested_prompt_shown',
  SUGGESTED_PROMPT_CLICKED = 'cli.suggested_prompt_clicked',

  // Backend
  AGENT_STEP = 'backend.agent_step',
  CREDIT_GRANT = 'backend.credit_grant',
  CREDIT_CONSUMED = 'backend.credit_consumed',
  MALFORMED_TOOL_CALL_JSON = 'backend.malformed_tool_call_json',
  TOOL_USE = 'backend.tool_use',
  UNKNOWN_TOOL_CALL = 'backend.unknown_tool_call',
  USER_INPUT = 'backend.user_input',

  // Backend - Database Operations
  ADVISORY_LOCK_CONTENTION = 'backend.advisory_lock_contention',
  TRANSACTION_RETRY_THRESHOLD_EXCEEDED = 'backend.transaction_retry_threshold_exceeded',

  // Backend - Subscription
  SUBSCRIPTION_CREATED = 'backend.subscription_created',
  SUBSCRIPTION_CANCELED = 'backend.subscription_canceled',
  SUBSCRIPTION_PAYMENT_FAILED = 'backend.subscription_payment_failed',
  SUBSCRIPTION_BLOCK_CREATED = 'backend.subscription_block_created',
  SUBSCRIPTION_BLOCK_LIMIT_HIT = 'backend.subscription_block_limit_hit',
  SUBSCRIPTION_WEEKLY_LIMIT_HIT = 'backend.subscription_weekly_limit_hit',
  SUBSCRIPTION_CREDITS_MIGRATED = 'backend.subscription_credits_migrated',
  SUBSCRIPTION_TIER_CHANGED = 'backend.subscription_tier_changed',

  // Web
  SIGNUP = 'web.signup',

  // Web - Authentication
  AUTH_LOGIN_STARTED = 'auth.login_started',
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

  // Web - Creator Attribution
  CODEBUFF_REFERRER_ATTRIBUTED = 'codebuff.referrer_attributed',

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

  // Web - API
  AGENT_RUN_API_REQUEST = 'api.agent_run_request',
  AGENT_RUN_CREATED = 'api.agent_run_created',
  AGENT_RUN_COMPLETED = 'api.agent_run_completed',
  AGENT_RUN_VALIDATION_ERROR = 'api.agent_run_validation_error',
  AGENT_RUN_CREATION_ERROR = 'api.agent_run_creation_error',
  AGENT_RUN_COMPLETION_ERROR = 'api.agent_run_completion_error',
  ME_API_REQUEST = 'api.me_request',
  ME_VALIDATION_ERROR = 'api.me_validation_error',
  CHAT_COMPLETIONS_REQUEST = 'api.chat_completions_request',
  CHAT_COMPLETIONS_AUTH_ERROR = 'api.chat_completions_auth_error',
  CHAT_COMPLETIONS_VALIDATION_ERROR = 'api.chat_completions_validation_error',
  CHAT_COMPLETIONS_INSUFFICIENT_CREDITS = 'api.chat_completions_insufficient_credits',
  CHAT_COMPLETIONS_GENERATION_STARTED = 'api.chat_completions_generation_started',
  CHAT_COMPLETIONS_STREAM_STARTED = 'api.chat_completions_stream_started',
  CHAT_COMPLETIONS_ERROR = 'api.chat_completions_error',

  // Web - Usage API
  USAGE_API_REQUEST = 'api.usage_request',
  USAGE_API_AUTH_ERROR = 'api.usage_auth_error',

  // Web - Search API
  WEB_SEARCH_REQUEST = 'api.web_search_request',
  WEB_SEARCH_AUTH_ERROR = 'api.web_search_auth_error',
  WEB_SEARCH_VALIDATION_ERROR = 'api.web_search_validation_error',
  WEB_SEARCH_INSUFFICIENT_CREDITS = 'api.web_search_insufficient_credits',
  WEB_SEARCH_ERROR = 'api.web_search_error',

  DOCS_SEARCH_REQUEST = 'api.docs_search_request',
  DOCS_SEARCH_AUTH_ERROR = 'api.docs_search_auth_error',
  DOCS_SEARCH_VALIDATION_ERROR = 'api.docs_search_validation_error',
  DOCS_SEARCH_INSUFFICIENT_CREDITS = 'api.docs_search_insufficient_credits',
  DOCS_SEARCH_ERROR = 'api.docs_search_error',

  GRAVITY_INDEX_REQUEST = 'api.gravity_index_request',
  GRAVITY_INDEX_AUTH_ERROR = 'api.gravity_index_auth_error',
  GRAVITY_INDEX_VALIDATION_ERROR = 'api.gravity_index_validation_error',
  GRAVITY_INDEX_ERROR = 'api.gravity_index_error',

  // Web - Feedback API
  FEEDBACK_SUBMITTED = 'api.feedback_submitted',
  FEEDBACK_AUTH_ERROR = 'api.feedback_auth_error',
  FEEDBACK_VALIDATION_ERROR = 'api.feedback_validation_error',

  // Web - Logs ingest API (client logs/events → BigQuery)
  LOGS_INGEST_AUTH_ERROR = 'api.logs_ingest_auth_error',
  LOGS_INGEST_VALIDATION_ERROR = 'api.logs_ingest_validation_error',

  // Web - Ads API
  ADS_API_AUTH_ERROR = 'api.ads_auth_error',
  ADS_CLICKED = 'ads.clicked',

  // Web - Token Count API
  TOKEN_COUNT_REQUEST = 'api.token_count_request',
  TOKEN_COUNT_AUTH_ERROR = 'api.token_count_auth_error',
  TOKEN_COUNT_VALIDATION_ERROR = 'api.token_count_validation_error',
  TOKEN_COUNT_ERROR = 'api.token_count_error',

  // ChatGPT OAuth
  CHATGPT_OAUTH_REQUEST = 'sdk.chatgpt_oauth_request',
  CHATGPT_OAUTH_RATE_LIMITED = 'sdk.chatgpt_oauth_rate_limited',
  CHATGPT_OAUTH_AUTH_ERROR = 'sdk.chatgpt_oauth_auth_error',

  // Freebuff - Creator Attribution
  FREEBUFF_REFERRER_ATTRIBUTED = 'freebuff.referrer_attributed',

  // Freebuff - Referral program server lifecycle (emitted from packages/billing
  // via the server logger → Axiom `event` column). Funnel: redeemed → completed
  // (both low-volume per-referral transitions). The "why is this still pending"
  // breakdown (account_too_new / no_github_account / not_activated) is NOT a
  // per-evaluation event — that would fire on every live trigger and dominate
  // ingest; it rides on `sweep`, which aggregates outcomes across the whole
  // pending population once per run (see ReferralSweepResult.outcomes).
  FREEBUFF_REFERRAL_REDEEMED = 'freebuff.referral.redeemed',
  // A redemption attempt that hit one of the one-shot eligibility guards
  // (signup_too_old, user_banned, referrer_limit_reached, reverse_referral,
  // self_referral). Deliberately EXCLUDES the two repeat-prone errors —
  // invalid_code (cookie intentionally kept for legacy codes) and
  // already_referred (cookie can outlive redemption on the /onboard RSC hop)
  // — which would otherwise re-fire on every <=10-min token mint; those log
  // at debug only. Without this event, a "my friend's invite didn't count"
  // support case is undiagnosable — the guards otherwise return silently.
  FREEBUFF_REFERRAL_REDEEM_FAILED = 'freebuff.referral.redeem_failed',
  // Attribution went through and the referred user redeemed from an IP or
  // browser the REFERRER was recently seen on. Evidence, NOT a verdict: this
  // is also exactly what a genuine in-person referral looks like ("try it,
  // here's my laptop" — a sibling on the family computer shares both). Only
  // suspicious when corroborated by real farm signals (dormant GitHub, burst
  // velocity, no product use); the sweep + scripts do that weighing.
  FREEBUFF_REFERRAL_SOCK_SIGNAL = 'freebuff.referral.sock_signal',
  FREEBUFF_REFERRAL_COMPLETED = 'freebuff.referral.completed',
  FREEBUFF_REFERRAL_SWEEP = 'freebuff.referral.sweep',

  // Freebuff - Get Started Page (referral onboarding funnel, in order:
  //   viewed → sign_in_clicked → signed_in → eligibility_resolved →
  //   [connect_github_clicked] → install_command_copied | web_clicked).
  // Every event carries a `referrer` prop (the inviter's name) for per-referrer
  // funnel breakdowns.
  FREEBUFF_GET_STARTED_VIEWED = 'freebuff.get_started_viewed',
  FREEBUFF_GET_STARTED_SIGN_IN_CLICKED = 'freebuff.get_started_sign_in_clicked',
  FREEBUFF_GET_STARTED_SIGNED_IN = 'freebuff.get_started_signed_in',
  FREEBUFF_GET_STARTED_ELIGIBILITY_RESOLVED = 'freebuff.get_started_eligibility_resolved',
  FREEBUFF_GET_STARTED_CONNECT_GITHUB_CLICKED = 'freebuff.get_started_connect_github_clicked',
  FREEBUFF_GET_STARTED_INSTALL_COMMAND_COPIED = 'freebuff.get_started_install_command_copied',
  FREEBUFF_GET_STARTED_WEB_CLICKED = 'freebuff.get_started_web_clicked',
  // Deprecated (previous get-started design — no longer fired):
  FREEBUFF_GET_STARTED_HELP_EXPANDED = 'freebuff.get_started_help_expanded',
  FREEBUFF_GET_STARTED_EDITOR_CLICKED = 'freebuff.get_started_editor_clicked',

  // Freebuff - Chat
  // Emitted once per new-thread title generation attempt (server-side). The
  // `outcome` property is one of: generated | empty | unknown_model | error |
  // aborted. Carries `latencyMs`, `model`, and `titleLength` so the failure/
  // fallback rate and added latency are queryable.
  FREEBUFF_CHAT_TITLE_GENERATED = 'freebuff.chat_title_generated',

  // Freebuff - Home Page
  FREEBUFF_HOME_INSTALL_COMMAND_COPIED = 'freebuff.home_install_command_copied',
  FREEBUFF_HOME_GITHUB_CLICKED = 'freebuff.home_github_clicked',
  FREEBUFF_HOME_INSTALL_GUIDE_EXPANDED = 'freebuff.home_install_guide_expanded',
  FREEBUFF_HOME_FAQ_OPENED = 'freebuff.home_faq_opened',

  // Freebuff - acquisition attribution (UTM / ad-click params captured as
  // super-properties; filter by utm_source, reddit_click_id, is_reddit_traffic)
  FREEBUFF_ATTRIBUTED = 'freebuff.attributed',
  // Freebuff - Reddit ad funnel (filter in PostHog by reddit_click_id / utm_source)
  FREEBUFF_REDDIT_FUNNEL_CLI_INSTALLED = 'freebuff.reddit_funnel.cli_installed',
  FREEBUFF_REDDIT_FUNNEL_LOGIN = 'freebuff.reddit_funnel.login',
  FREEBUFF_REDDIT_FUNNEL_SIGN_UP = 'freebuff.reddit_funnel.sign_up',
  FREEBUFF_REDDIT_FUNNEL_FIRST_PROMPT = 'freebuff.reddit_funnel.first_prompt',
  FREEBUFF_REDDIT_FUNNEL_GRAVITY_AD_CLICK = 'freebuff.reddit_funnel.gravity_ad_click',

  // Freebuff Desktop (Electron app)
  // Mirrors the CLI's surface events so the desktop shows up in the same DAU /
  // login funnels. `message_sent` (above) is reused with `surface: 'desktop'`;
  // these capture the launch, auth, and per-turn activity unique to the app.
  DESKTOP_APP_LAUNCHED = 'desktop.app_launched',
  DESKTOP_LOGIN = 'desktop.login',
  DESKTOP_LOGOUT = 'desktop.logout',
  DESKTOP_THREAD_CREATED = 'desktop.thread_created',
  DESKTOP_THREAD_TITLED = 'desktop.thread_titled',
  DESKTOP_PROJECT_OPENED = 'desktop.project_opened',
  DESKTOP_TURN_COMPLETED = 'desktop.turn_completed',
  DESKTOP_HARNESS_CHANGED = 'desktop.harness_changed',
  DESKTOP_MODEL_CHANGED = 'desktop.model_changed',
  DESKTOP_SKILL_RUN = 'desktop.skill_run',
  DESKTOP_QUEUE_SEND_NOW = 'desktop.queue_send_now',
  // Sponsored ads interspersed into the transcript (server-side ads_* events
  // in web/api/v1/ads capture the fetch/impression/click ledger; these are the
  // desktop-surface funnels).
  DESKTOP_AD_SHOWN = 'desktop.ad_shown',
  DESKTOP_AD_CLICKED = 'desktop.ad_clicked',

  // Common
  FLUSH_FAILED = 'common.flush_failed',

  // Client Logging - for sending logger events to PostHog in production
  CLI_LOG = 'cli.log',
}
