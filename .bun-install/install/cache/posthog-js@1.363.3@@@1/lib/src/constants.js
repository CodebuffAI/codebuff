"use strict";
/*
 * Constants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAPTURE_RATE_LIMIT = exports.CLIENT_SESSION_PROPS = exports.USER_STATE = exports.PERSISTENCE_FEATURE_FLAG_EVALUATED_AT = exports.PERSISTENCE_FEATURE_FLAG_ERRORS = exports.FLAG_CALL_REPORTED_SESSION_ID = exports.FLAG_CALL_REPORTED = exports.CONVERSATIONS = exports.PRODUCT_TOURS_ACTIVATED = exports.SURVEYS_ACTIVATED = exports.SURVEYS = exports.STORED_GROUP_PROPERTIES_KEY = exports.STORED_PERSON_PROPERTIES_KEY = exports.PERSISTENCE_FEATURE_FLAG_DETAILS = exports.PERSISTENCE_EARLY_ACCESS_FEATURES = exports.ENABLED_FEATURE_FLAGS = exports.SESSION_RECORDING_FIRST_FULL_SNAPSHOT_TIMESTAMP = exports.SESSION_RECORDING_EVENT_TRIGGER_ACTIVATED_SESSION = exports.SESSION_RECORDING_URL_TRIGGER_ACTIVATED_SESSION = exports.SESSION_RECORDING_PAST_MINIMUM_DURATION = exports.SESSION_RECORDING_IS_SAMPLED = exports.SESSION_ID = exports.SESSION_RECORDING_OVERRIDE_EVENT_TRIGGER = exports.SESSION_RECORDING_OVERRIDE_URL_TRIGGER = exports.SESSION_RECORDING_OVERRIDE_LINKED_FLAG = exports.SESSION_RECORDING_OVERRIDE_SAMPLING = exports.SESSION_RECORDING_SCRIPT_CONFIG = exports.SESSION_RECORDING_MINIMUM_DURATION = exports.SESSION_RECORDING_SAMPLE_RATE = exports.SESSION_RECORDING_CANVAS_RECORDING = exports.SESSION_RECORDING_MASKING = exports.SESSION_RECORDING_NETWORK_PAYLOAD_CAPTURE = exports.CONSOLE_LOG_RECORDING_ENABLED_SERVER_SIDE = exports.SESSION_RECORDING_ENABLED_SERVER_SIDE = exports.SESSION_RECORDING_REMOTE_CONFIG = exports.WEB_VITALS_ALLOWED_METRICS = exports.PRODUCT_TOURS_ENABLED_SERVER_SIDE = exports.DEAD_CLICKS_ENABLED_SERVER_SIDE = exports.WEB_VITALS_ENABLED_SERVER_SIDE = exports.ERROR_TRACKING_CAPTURE_EXTENSION_EXCEPTIONS = exports.ERROR_TRACKING_SUPPRESSION_RULES = exports.EXCEPTION_CAPTURE_ENABLED_SERVER_SIDE = exports.HEATMAPS_ENABLED_SERVER_SIDE = exports.AUTOCAPTURE_DISABLED_SERVER_SIDE = exports.EVENT_TIMERS_KEY = exports.CAMPAIGN_IDS_KEY = exports.ALIAS_ID_KEY = exports.DEVICE_ID = exports.DISTINCT_ID = exports.PEOPLE_DISTINCT_ID_KEY = void 0;
exports.Z_INDEX_CONVERSATIONS = exports.Z_INDEX_SURVEYS = exports.Z_INDEX_TOURS = exports.EVENT_GROUPIDENTIFY = exports.EVENT_IDENTIFY = exports.EVENT_PAGELEAVE = exports.EVENT_PAGEVIEW = exports.DOM_EVENT_BEFOREUNLOAD = exports.DOM_EVENT_VISIBILITYCHANGE = exports.PERSON_PROFILES_IDENTIFIED_ONLY = exports.USER_STATE_IDENTIFIED = exports.USER_STATE_ANONYMOUS = exports.COOKIELESS_ALWAYS = exports.COOKIELESS_ON_REJECT = exports.LOAD_EXT_NOT_FOUND = exports.SURVEYS_REQUEST_TIMEOUT_MS = exports.PERSISTENCE_RESERVED_PROPERTIES = exports.WEB_EXPERIMENTS = exports.COOKIELESS_MODE_FLAG_PROPERTY = exports.COOKIELESS_SENTINEL_VALUE = exports.TOOLBAR_CONTAINER_CLASS = exports.TOOLBAR_ID = exports.ENABLE_PERSON_PROCESSING = exports.INITIAL_PERSON_INFO = exports.INITIAL_REFERRER_INFO = exports.INITIAL_CAMPAIGN_PARAMS = void 0;
/* PROPERTY KEYS */
// This key is deprecated, but we want to check for it to see whether aliasing is allowed.
exports.PEOPLE_DISTINCT_ID_KEY = '$people_distinct_id';
exports.DISTINCT_ID = 'distinct_id';
exports.DEVICE_ID = '$device_id';
exports.ALIAS_ID_KEY = '__alias';
exports.CAMPAIGN_IDS_KEY = '__cmpns';
exports.EVENT_TIMERS_KEY = '__timers';
exports.AUTOCAPTURE_DISABLED_SERVER_SIDE = '$autocapture_disabled_server_side';
exports.HEATMAPS_ENABLED_SERVER_SIDE = '$heatmaps_enabled_server_side';
exports.EXCEPTION_CAPTURE_ENABLED_SERVER_SIDE = '$exception_capture_enabled_server_side';
exports.ERROR_TRACKING_SUPPRESSION_RULES = '$error_tracking_suppression_rules';
exports.ERROR_TRACKING_CAPTURE_EXTENSION_EXCEPTIONS = '$error_tracking_capture_extension_exceptions';
exports.WEB_VITALS_ENABLED_SERVER_SIDE = '$web_vitals_enabled_server_side';
exports.DEAD_CLICKS_ENABLED_SERVER_SIDE = '$dead_clicks_enabled_server_side';
exports.PRODUCT_TOURS_ENABLED_SERVER_SIDE = '$product_tours_enabled_server_side';
exports.WEB_VITALS_ALLOWED_METRICS = '$web_vitals_allowed_metrics';
exports.SESSION_RECORDING_REMOTE_CONFIG = '$session_recording_remote_config';
// @deprecated can be removed along with eager loaded replay
exports.SESSION_RECORDING_ENABLED_SERVER_SIDE = '$session_recording_enabled_server_side';
// @deprecated can be removed along with eager loaded replay
exports.CONSOLE_LOG_RECORDING_ENABLED_SERVER_SIDE = '$console_log_recording_enabled_server_side';
// @deprecated can be removed along with eager loaded replay
exports.SESSION_RECORDING_NETWORK_PAYLOAD_CAPTURE = '$session_recording_network_payload_capture';
// @deprecated can be removed along with eager loaded replay
exports.SESSION_RECORDING_MASKING = '$session_recording_masking';
// @deprecated can be removed along with eager loaded replay
exports.SESSION_RECORDING_CANVAS_RECORDING = '$session_recording_canvas_recording';
// @deprecated can be removed along with eager loaded replay
exports.SESSION_RECORDING_SAMPLE_RATE = '$replay_sample_rate';
// @deprecated can be removed along with eager loaded replay
exports.SESSION_RECORDING_MINIMUM_DURATION = '$replay_minimum_duration';
// @deprecated can be removed along with eager loaded replay
exports.SESSION_RECORDING_SCRIPT_CONFIG = '$replay_script_config';
exports.SESSION_RECORDING_OVERRIDE_SAMPLING = '$replay_override_sampling';
exports.SESSION_RECORDING_OVERRIDE_LINKED_FLAG = '$replay_override_linked_flag';
exports.SESSION_RECORDING_OVERRIDE_URL_TRIGGER = '$replay_override_url_trigger';
exports.SESSION_RECORDING_OVERRIDE_EVENT_TRIGGER = '$replay_override_event_trigger';
exports.SESSION_ID = '$sesid';
exports.SESSION_RECORDING_IS_SAMPLED = '$session_is_sampled';
exports.SESSION_RECORDING_PAST_MINIMUM_DURATION = '$session_past_minimum_duration';
exports.SESSION_RECORDING_URL_TRIGGER_ACTIVATED_SESSION = '$session_recording_url_trigger_activated_session';
exports.SESSION_RECORDING_EVENT_TRIGGER_ACTIVATED_SESSION = '$session_recording_event_trigger_activated_session';
exports.SESSION_RECORDING_FIRST_FULL_SNAPSHOT_TIMESTAMP = '$debug_first_full_snapshot_timestamp';
exports.ENABLED_FEATURE_FLAGS = '$enabled_feature_flags';
exports.PERSISTENCE_EARLY_ACCESS_FEATURES = '$early_access_features';
exports.PERSISTENCE_FEATURE_FLAG_DETAILS = '$feature_flag_details';
exports.STORED_PERSON_PROPERTIES_KEY = '$stored_person_properties';
exports.STORED_GROUP_PROPERTIES_KEY = '$stored_group_properties';
exports.SURVEYS = '$surveys';
exports.SURVEYS_ACTIVATED = '$surveys_activated';
exports.PRODUCT_TOURS_ACTIVATED = '$product_tours_activated';
exports.CONVERSATIONS = '$conversations';
exports.FLAG_CALL_REPORTED = '$flag_call_reported';
exports.FLAG_CALL_REPORTED_SESSION_ID = '$flag_call_reported_session_id';
exports.PERSISTENCE_FEATURE_FLAG_ERRORS = '$feature_flag_errors';
exports.PERSISTENCE_FEATURE_FLAG_EVALUATED_AT = '$feature_flag_evaluated_at';
exports.USER_STATE = '$user_state';
exports.CLIENT_SESSION_PROPS = '$client_session_props';
exports.CAPTURE_RATE_LIMIT = '$capture_rate_limit';
/** @deprecated Delete this when INITIAL_PERSON_INFO has been around for long enough to ignore backwards compat */
exports.INITIAL_CAMPAIGN_PARAMS = '$initial_campaign_params';
/** @deprecated Delete this when INITIAL_PERSON_INFO has been around for long enough to ignore backwards compat */
exports.INITIAL_REFERRER_INFO = '$initial_referrer_info';
exports.INITIAL_PERSON_INFO = '$initial_person_info';
exports.ENABLE_PERSON_PROCESSING = '$epp';
exports.TOOLBAR_ID = '__POSTHOG_TOOLBAR__';
exports.TOOLBAR_CONTAINER_CLASS = 'toolbar-global-fade-container';
/**
 * PREVIEW - MAY CHANGE WITHOUT WARNING - DO NOT USE IN PRODUCTION
 * Sentinel value for distinct id, device id, session id. Signals that the server should generate the value
 * */
exports.COOKIELESS_SENTINEL_VALUE = '$posthog_cookieless';
exports.COOKIELESS_MODE_FLAG_PROPERTY = '$cookieless_mode';
exports.WEB_EXPERIMENTS = '$web_experiments';
// These are properties that are reserved and will not be automatically included in events
exports.PERSISTENCE_RESERVED_PROPERTIES = [
    exports.PEOPLE_DISTINCT_ID_KEY,
    exports.ALIAS_ID_KEY,
    exports.CAMPAIGN_IDS_KEY,
    exports.EVENT_TIMERS_KEY,
    exports.SESSION_RECORDING_ENABLED_SERVER_SIDE,
    exports.HEATMAPS_ENABLED_SERVER_SIDE,
    exports.SESSION_ID,
    exports.ENABLED_FEATURE_FLAGS,
    exports.ERROR_TRACKING_SUPPRESSION_RULES,
    exports.USER_STATE,
    exports.PERSISTENCE_EARLY_ACCESS_FEATURES,
    exports.PERSISTENCE_FEATURE_FLAG_DETAILS,
    exports.STORED_GROUP_PROPERTIES_KEY,
    exports.STORED_PERSON_PROPERTIES_KEY,
    exports.SURVEYS,
    exports.FLAG_CALL_REPORTED,
    exports.FLAG_CALL_REPORTED_SESSION_ID,
    exports.PERSISTENCE_FEATURE_FLAG_ERRORS,
    exports.PERSISTENCE_FEATURE_FLAG_EVALUATED_AT,
    exports.CLIENT_SESSION_PROPS,
    exports.CAPTURE_RATE_LIMIT,
    exports.INITIAL_CAMPAIGN_PARAMS,
    exports.INITIAL_REFERRER_INFO,
    exports.ENABLE_PERSON_PROCESSING,
    exports.INITIAL_PERSON_INFO,
];
exports.SURVEYS_REQUEST_TIMEOUT_MS = 10000;
exports.LOAD_EXT_NOT_FOUND = 'PostHog loadExternalDependency extension not found.';
/* EVENT NAMES - interned to reduce bundle size */
/* COOKIELESS MODE VALUES */
exports.COOKIELESS_ON_REJECT = 'on_reject';
exports.COOKIELESS_ALWAYS = 'always';
/* USER STATE VALUES */
exports.USER_STATE_ANONYMOUS = 'anonymous';
exports.USER_STATE_IDENTIFIED = 'identified';
/* PERSON PROFILE MODES */
exports.PERSON_PROFILES_IDENTIFIED_ONLY = 'identified_only';
/* DOM EVENT NAMES - interned to reduce bundle size */
exports.DOM_EVENT_VISIBILITYCHANGE = 'visibilitychange';
exports.DOM_EVENT_BEFOREUNLOAD = 'beforeunload';
exports.EVENT_PAGEVIEW = '$pageview';
exports.EVENT_PAGELEAVE = '$pageleave';
exports.EVENT_IDENTIFY = '$identify';
exports.EVENT_GROUPIDENTIFY = '$groupidentify';
/* Z-INDEX HIERARCHY: tours > surveys > support */
exports.Z_INDEX_TOURS = 2147483646;
exports.Z_INDEX_SURVEYS = 2147483645;
exports.Z_INDEX_CONVERSATIONS = 2147483644;
//# sourceMappingURL=constants.js.map