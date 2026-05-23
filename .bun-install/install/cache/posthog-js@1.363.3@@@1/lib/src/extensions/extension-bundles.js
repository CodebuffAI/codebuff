"use strict";
/**
 * Pre-grouped extension bundles for tree-shaking support.
 *
 * Each bundle is self-contained: a feature plus its runtime dependencies.
 * Use these with `__extensionClasses` to control which extensions are included in your bundle.
 * The default `posthog-js` entrypoint includes all extensions. When using `posthog-js/slim`,
 * you can import only the bundles you need:
 *
 * @example
 * ```ts
 * import posthog from 'posthog-js/slim'
 * import { SessionReplayExtensions, AnalyticsExtensions } from 'posthog-js/extensions'
 *
 * posthog.init('ph_key', {
 *   __extensionClasses: {
 *     ...SessionReplayExtensions,
 *     ...AnalyticsExtensions,
 *   }
 * })
 * ```
 *
 * @module
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExtensions = exports.LogsExtensions = exports.ConversationsExtensions = exports.ExperimentsExtensions = exports.ToolbarExtensions = exports.SurveysExtensions = exports.TracingExtensions = exports.SiteAppsExtensions = exports.ProductToursExtensions = exports.ErrorTrackingExtensions = exports.AnalyticsExtensions = exports.SessionReplayExtensions = exports.FeatureFlagsExtensions = void 0;
var autocapture_1 = require("../autocapture");
var dead_clicks_autocapture_1 = require("./dead-clicks-autocapture");
var exception_autocapture_1 = require("./exception-autocapture");
var history_autocapture_1 = require("./history-autocapture");
var tracing_headers_1 = require("./tracing-headers");
var web_vitals_1 = require("./web-vitals");
var session_recording_1 = require("./replay/session-recording");
var heatmaps_1 = require("../heatmaps");
var posthog_product_tours_1 = require("../posthog-product-tours");
var site_apps_1 = require("../site-apps");
var posthog_surveys_1 = require("../posthog-surveys");
var toolbar_1 = require("./toolbar");
var posthog_featureflags_1 = require("../posthog-featureflags");
var posthog_exceptions_1 = require("../posthog-exceptions");
var web_experiments_1 = require("../web-experiments");
var posthog_conversations_1 = require("./conversations/posthog-conversations");
var posthog_logs_1 = require("../posthog-logs");
/** Feature flags. */
exports.FeatureFlagsExtensions = {
    featureFlags: posthog_featureflags_1.PostHogFeatureFlags,
};
/** Session replay. */
exports.SessionReplayExtensions = {
    sessionRecording: session_recording_1.SessionRecording,
};
/** Autocapture, click tracking, heatmaps, and web vitals. */
exports.AnalyticsExtensions = {
    autocapture: autocapture_1.Autocapture,
    historyAutocapture: history_autocapture_1.HistoryAutocapture,
    heatmaps: heatmaps_1.Heatmaps,
    deadClicksAutocapture: dead_clicks_autocapture_1.DeadClicksAutocapture,
    webVitalsAutocapture: web_vitals_1.WebVitalsAutocapture,
};
/** Exception and error capture. Requires both the observer (capture hook) and exceptions (forwarding). */
exports.ErrorTrackingExtensions = {
    exceptionObserver: exception_autocapture_1.ExceptionObserver,
    exceptions: posthog_exceptions_1.PostHogExceptions,
};
/** In-app product tours. Includes feature flags for targeting. */
exports.ProductToursExtensions = __assign({ productTours: posthog_product_tours_1.PostHogProductTours }, exports.FeatureFlagsExtensions);
/** Site apps support. */
exports.SiteAppsExtensions = {
    siteApps: site_apps_1.SiteApps,
};
/** Distributed tracing header injection. */
exports.TracingExtensions = {
    tracingHeaders: tracing_headers_1.TracingHeaders,
};
/** In-app surveys. Includes feature flags for targeting. */
exports.SurveysExtensions = __assign({ surveys: posthog_surveys_1.PostHogSurveys }, exports.FeatureFlagsExtensions);
/** PostHog toolbar for visual element inspection and action setup. */
exports.ToolbarExtensions = {
    toolbar: toolbar_1.Toolbar,
};
/** Web experiments. Includes feature flags for variant evaluation. */
exports.ExperimentsExtensions = __assign({ experiments: web_experiments_1.WebExperiments }, exports.FeatureFlagsExtensions);
/** In-app conversations. */
exports.ConversationsExtensions = {
    conversations: posthog_conversations_1.PostHogConversations,
};
/** Console log capture. */
exports.LogsExtensions = {
    logs: posthog_logs_1.PostHogLogs,
};
/** All extensions — equivalent to the default `posthog-js` bundle. */
exports.AllExtensions = __assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign({}, exports.FeatureFlagsExtensions), exports.SessionReplayExtensions), exports.AnalyticsExtensions), exports.ErrorTrackingExtensions), exports.ProductToursExtensions), exports.SiteAppsExtensions), exports.SurveysExtensions), exports.TracingExtensions), exports.ToolbarExtensions), exports.ExperimentsExtensions), exports.ConversationsExtensions), exports.LogsExtensions);
//# sourceMappingURL=extension-bundles.js.map