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
import { Autocapture } from '../autocapture';
import { DeadClicksAutocapture } from './dead-clicks-autocapture';
import { ExceptionObserver } from './exception-autocapture';
import { HistoryAutocapture } from './history-autocapture';
import { TracingHeaders } from './tracing-headers';
import { WebVitalsAutocapture } from './web-vitals';
import { SessionRecording } from './replay/session-recording';
import { Heatmaps } from '../heatmaps';
import { PostHogProductTours } from '../posthog-product-tours';
import { SiteApps } from '../site-apps';
import { PostHogSurveys } from '../posthog-surveys';
import { Toolbar } from './toolbar';
import { PostHogFeatureFlags } from '../posthog-featureflags';
import { PostHogExceptions } from '../posthog-exceptions';
import { WebExperiments } from '../web-experiments';
import { PostHogConversations } from './conversations/posthog-conversations';
import { PostHogLogs } from '../posthog-logs';
/** Feature flags. */
export declare const FeatureFlagsExtensions: {
    readonly featureFlags: typeof PostHogFeatureFlags;
};
/** Session replay. */
export declare const SessionReplayExtensions: {
    readonly sessionRecording: typeof SessionRecording;
};
/** Autocapture, click tracking, heatmaps, and web vitals. */
export declare const AnalyticsExtensions: {
    readonly autocapture: typeof Autocapture;
    readonly historyAutocapture: typeof HistoryAutocapture;
    readonly heatmaps: typeof Heatmaps;
    readonly deadClicksAutocapture: typeof DeadClicksAutocapture;
    readonly webVitalsAutocapture: typeof WebVitalsAutocapture;
};
/** Exception and error capture. Requires both the observer (capture hook) and exceptions (forwarding). */
export declare const ErrorTrackingExtensions: {
    readonly exceptionObserver: typeof ExceptionObserver;
    readonly exceptions: typeof PostHogExceptions;
};
/** In-app product tours. Includes feature flags for targeting. */
export declare const ProductToursExtensions: {
    readonly featureFlags: typeof PostHogFeatureFlags;
    readonly productTours: typeof PostHogProductTours;
};
/** Site apps support. */
export declare const SiteAppsExtensions: {
    readonly siteApps: typeof SiteApps;
};
/** Distributed tracing header injection. */
export declare const TracingExtensions: {
    readonly tracingHeaders: typeof TracingHeaders;
};
/** In-app surveys. Includes feature flags for targeting. */
export declare const SurveysExtensions: {
    readonly featureFlags: typeof PostHogFeatureFlags;
    readonly surveys: typeof PostHogSurveys;
};
/** PostHog toolbar for visual element inspection and action setup. */
export declare const ToolbarExtensions: {
    readonly toolbar: typeof Toolbar;
};
/** Web experiments. Includes feature flags for variant evaluation. */
export declare const ExperimentsExtensions: {
    readonly featureFlags: typeof PostHogFeatureFlags;
    readonly experiments: typeof WebExperiments;
};
/** In-app conversations. */
export declare const ConversationsExtensions: {
    readonly conversations: typeof PostHogConversations;
};
/** Console log capture. */
export declare const LogsExtensions: {
    readonly logs: typeof PostHogLogs;
};
/** All extensions — equivalent to the default `posthog-js` bundle. */
export declare const AllExtensions: {
    readonly logs: typeof PostHogLogs;
    readonly conversations: typeof PostHogConversations;
    readonly featureFlags: typeof PostHogFeatureFlags;
    readonly experiments: typeof WebExperiments;
    readonly toolbar: typeof Toolbar;
    readonly tracingHeaders: typeof TracingHeaders;
    readonly surveys: typeof PostHogSurveys;
    readonly siteApps: typeof SiteApps;
    readonly productTours: typeof PostHogProductTours;
    readonly exceptionObserver: typeof ExceptionObserver;
    readonly exceptions: typeof PostHogExceptions;
    readonly autocapture: typeof Autocapture;
    readonly historyAutocapture: typeof HistoryAutocapture;
    readonly heatmaps: typeof Heatmaps;
    readonly deadClicksAutocapture: typeof DeadClicksAutocapture;
    readonly webVitalsAutocapture: typeof WebVitalsAutocapture;
    readonly sessionRecording: typeof SessionRecording;
};
