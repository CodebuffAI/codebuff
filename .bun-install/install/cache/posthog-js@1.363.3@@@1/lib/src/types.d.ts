import { PostHog } from './posthog-core';
import { Survey } from './posthog-surveys-types';
import { ConversationsRemoteConfig } from './posthog-conversations-types';
import type { SAMPLED } from './extensions/replay/external/triggerMatching';
import type { ExtensionConstructor } from './extensions/types';
import type { Autocapture } from './autocapture';
import type { DeadClicksAutocapture } from './extensions/dead-clicks-autocapture';
import type { ExceptionObserver } from './extensions/exception-autocapture';
import type { HistoryAutocapture } from './extensions/history-autocapture';
import type { TracingHeaders } from './extensions/tracing-headers';
import type { WebVitalsAutocapture } from './extensions/web-vitals';
import type { SessionRecording } from './extensions/replay/session-recording';
import type { Heatmaps } from './heatmaps';
import type { PostHogProductTours } from './posthog-product-tours';
import type { SiteApps } from './site-apps';
import type { PostHogSurveys } from './posthog-surveys';
import type { Toolbar } from './extensions/toolbar';
import type { PostHogExceptions } from './posthog-exceptions';
import type { WebExperiments } from './web-experiments';
import type { PostHogConversations } from './extensions/conversations/posthog-conversations';
import type { PostHogFeatureFlags } from './posthog-featureflags';
import type { PostHogLogs } from './posthog-logs';
export type { Property, Properties, JsonType, JsonRecord } from '@posthog/types';
export type { KnownEventName, EventName, CaptureResult, CaptureOptions, BeforeSendFn } from '@posthog/types';
export type { FeatureFlagsCallback, FeatureFlagDetail, FeatureFlagMetadata, EvaluationReason, FeatureFlagResult, FeatureFlagOptions, RemoteConfigFeatureFlagCallback, EarlyAccessFeature, EarlyAccessFeatureStage, EarlyAccessFeatureCallback, EarlyAccessFeatureResponse, FeatureFlagOverrides, FeatureFlagPayloadOverrides, FeatureFlagOverrideOptions, OverrideFeatureFlagsOptions, } from '@posthog/types';
export type { Headers, RequestResponse, RequestCallback } from '@posthog/types';
export type { SessionRecordingCanvasOptions, InitiatorType, NetworkRequest, CapturedNetworkRequest, SessionIdChangedCallback, SeverityLevel, } from '@posthog/types';
export type { AutocaptureCompatibleElement, DomAutocaptureEvents, AutocaptureConfig, RageclickConfig, BootstrapConfig, SupportedWebVitalsMetrics, PerformanceCaptureConfig, DeadClickCandidate, ExceptionAutoCaptureConfig, DeadClicksAutoCaptureConfig, HeatmapConfig, ConfigDefaults, ExternalIntegrationKind, ErrorTrackingOptions, MaskInputOptions, SlimDOMOptions, SessionRecordingOptions, RequestQueueConfig, } from '@posthog/types';
export type { ToolbarUserIntent, ToolbarSource, ToolbarVersion, ToolbarParams } from '@posthog/types';
export type { KnownUnsafeEditableEvent } from '@posthog/core';
import type { SessionRecordingCanvasOptions, PerformanceCaptureConfig, InitiatorType, JsonType, Properties, EventName, CapturedNetworkRequest, SessionRecordingOptions, FeatureFlagDetail, ToolbarParams, PostHogConfig as BasePostHogConfig, PostHog as BasePostHogInterface, RequestResponse } from '@posthog/types';
export type PostHogInterface = Omit<BasePostHogInterface, 'config' | 'init'>;
export type PostHogConfig = Omit<BasePostHogConfig, 'loaded'> & {
    loaded: (posthog: PostHogInterface) => void;
    /**
     * Internal: Extension class overrides for tree-shaking support.
     * When provided, these classes are used instead of the default imports.
     * This enables entrypoints to control which extensions are bundled.
     * @internal
     */
    __extensionClasses?: {
        exceptions?: ExtensionConstructor<PostHogExceptions>;
        historyAutocapture?: ExtensionConstructor<HistoryAutocapture>;
        tracingHeaders?: ExtensionConstructor<TracingHeaders>;
        siteApps?: ExtensionConstructor<SiteApps>;
        sessionRecording?: ExtensionConstructor<SessionRecording>;
        autocapture?: ExtensionConstructor<Autocapture>;
        productTours?: ExtensionConstructor<PostHogProductTours>;
        heatmaps?: ExtensionConstructor<Heatmaps>;
        webVitalsAutocapture?: ExtensionConstructor<WebVitalsAutocapture>;
        exceptionObserver?: ExtensionConstructor<ExceptionObserver>;
        deadClicksAutocapture?: ExtensionConstructor<DeadClicksAutocapture>;
        surveys?: ExtensionConstructor<PostHogSurveys>;
        toolbar?: ExtensionConstructor<Toolbar>;
        experiments?: ExtensionConstructor<WebExperiments>;
        conversations?: ExtensionConstructor<PostHogConversations>;
        featureFlags?: ExtensionConstructor<PostHogFeatureFlags>;
        logs?: ExtensionConstructor<PostHogLogs>;
    };
};
type NextOptions = {
    revalidate: false | 0 | number;
    tags: string[];
};
export interface RequestWithOptions {
    url: string;
    data?: Record<string, any> | Record<string, any>[];
    headers?: Record<string, any>;
    transport?: 'XHR' | 'fetch' | 'sendBeacon';
    method?: 'POST' | 'GET';
    urlQueryArgs?: {
        compression: Compression;
    };
    callback?: (response: RequestResponse) => void;
    timeout?: number;
    noRetries?: boolean;
    disableTransport?: ('XHR' | 'fetch' | 'sendBeacon')[];
    disableXHRCredentials?: boolean;
    compression?: Compression | 'best-available';
    fetchOptions?: {
        cache?: RequestInit['cache'];
        next?: NextOptions;
    };
}
export interface QueuedRequestWithOptions extends RequestWithOptions {
    /** key of queue, e.g. 'sessionRecording' vs 'event' */
    batchKey?: string;
}
export interface RetriableRequestWithOptions extends QueuedRequestWithOptions {
    retriesPerformedSoFar?: number;
}
export type FlagVariant = {
    flag: string;
    variant: string;
};
/** the config stored in persistence when session recording remote config is received */
export type SessionRecordingPersistedConfig = Omit<SessionRecordingRemoteConfig, 'recordCanvas' | 'canvasFps' | 'canvasQuality' | 'networkPayloadCapture' | 'sampleRate' | 'minimumDurationMilliseconds'> & {
    /**
     * Used to determine if the persisted config is still valid or we need to wait for a new one
     * only accepts undefined since older versions of the library didn't set this.
     */
    cache_timestamp?: number;
    enabled: boolean;
    networkPayloadCapture: SessionRecordingRemoteConfig['networkPayloadCapture'] & {
        capturePerformance: RemoteConfig['capturePerformance'];
    };
    canvasRecording: {
        enabled: SessionRecordingRemoteConfig['recordCanvas'];
        fps: SessionRecordingRemoteConfig['canvasFps'];
        quality: SessionRecordingRemoteConfig['canvasQuality'];
    };
    sampleRate: number | null;
    minimumDurationMilliseconds: number | null | undefined;
};
export type SessionRecordingRemoteConfig = SessionRecordingCanvasOptions & {
    endpoint?: string;
    consoleLogRecordingEnabled?: boolean;
    sampleRate?: string | null;
    minimumDurationMilliseconds?: number;
    linkedFlag?: string | FlagVariant | null;
    networkPayloadCapture?: Pick<NetworkRecordOptions, 'recordBody' | 'recordHeaders'>;
    masking?: Pick<SessionRecordingOptions, 'maskAllInputs' | 'maskTextSelector' | 'blockSelector'>;
    urlTriggers?: SessionRecordingUrlTrigger[];
    scriptConfig?: {
        script?: string | undefined;
    };
    urlBlocklist?: SessionRecordingUrlTrigger[];
    eventTriggers?: string[];
    /**
     * Controls how event, url, sampling, and linked flag triggers are combined
     *
     * `any` means that if any of the triggers match, the session will be recorded
     * `all` means that all the triggers must match for the session to be recorded
     *
     * originally it was (event || url) && (sampling || linked flag)
     * which nobody wanted, now the default is all
     */
    triggerMatchType?: 'any' | 'all';
};
/**
 * Remote configuration for the PostHog instance
 *
 * All of these settings can be configured directly in your PostHog instance
 * Any configuration set in the client overrides the information from the server
 */
export interface RemoteConfig {
    /**
     * Supported compression algorithms
     */
    supportedCompression: Compression[];
    /**
     * If set, disables autocapture
     */
    autocapture_opt_out?: boolean;
    /**
     *     originally capturePerformance was replay only and so boolean true
     *     is equivalent to { network_timing: true }
     *     now capture performance can be separately enabled within replay
     *     and as a standalone web vitals tracker
     *     people can have them enabled separately
     *     they work standalone but enhance each other
     *     TODO: deprecate this so we make a new config that doesn't need this explanation
     */
    capturePerformance?: boolean | PerformanceCaptureConfig;
    /**
     * Whether we should use a custom endpoint for analytics
     *
     * @default { endpoint: "/e" }
     */
    analytics?: {
        endpoint?: string;
    };
    /**
     * Whether the `$elements_chain` property should be sent as a string or as an array
     *
     * @default false
     */
    elementsChainAsString?: boolean;
    /**
     * Error tracking configuration options
     */
    errorTracking?: {
        autocaptureExceptions?: boolean;
        captureExtensionExceptions?: boolean;
        suppressionRules?: ErrorTrackingSuppressionRule[];
    };
    /**
     * Whether capturing logs to the logs product is enabled
     */
    logs?: {
        captureConsoleLogs?: boolean;
    };
    /**
     * This is currently in development and may have breaking changes without a major version bump
     */
    autocaptureExceptions?: boolean | {
        endpoint?: string;
    };
    /**
     * Session recording configuration options
     */
    sessionRecording?: SessionRecordingRemoteConfig | false;
    /**
     * Whether surveys are enabled
     */
    surveys?: boolean | Survey[];
    /**
     * Whether product tours are enabled
     */
    productTours?: boolean;
    /**
     * Parameters for the toolbar
     */
    toolbarParams: ToolbarParams;
    /**
     * @deprecated renamed to toolbarParams, still present on older API responses
     */
    editorParams?: ToolbarParams;
    /**
     * @deprecated, moved to toolbarParams
     */
    toolbarVersion: 'toolbar';
    /**
     * Whether the user is authenticated
     */
    isAuthenticated: boolean;
    /**
     * List of site apps with their IDs and URLs
     */
    siteApps: {
        id: string;
        url: string;
    }[];
    /**
     * Whether heatmaps are enabled
     */
    heatmaps?: boolean;
    /**
     * Whether to only capture identified users by default
     */
    defaultIdentifiedOnly?: boolean;
    /**
     * Whether to capture dead clicks
     */
    captureDeadClicks?: boolean;
    /**
     * Indicates if the team has any flags enabled (if not we don't need to load them)
     */
    hasFeatureFlags?: boolean;
    /**
     * Conversations widget configuration
     */
    conversations?: boolean | ConversationsRemoteConfig;
}
/**
 * Flags returns feature flags and their payloads
 */
export interface FlagsResponse extends RemoteConfig {
    featureFlags: Record<string, string | boolean>;
    featureFlagPayloads: Record<string, JsonType>;
    errorsWhileComputingFlags: boolean;
    requestId?: string;
    flags: Record<string, FeatureFlagDetail>;
    evaluatedAt?: number;
}
export type SiteAppGlobals = {
    event: {
        uuid: string;
        event: EventName;
        properties: Properties;
        timestamp?: Date;
        elements_chain?: string;
        distinct_id?: string;
    };
    person: {
        properties: Properties;
    };
    groups: Record<string, {
        id: string;
        type: string;
        properties: Properties;
    }>;
};
export type SiteAppLoader = {
    id: string;
    init: (config: {
        posthog: PostHog;
        callback: (success: boolean) => void;
    }) => {
        processEvent?: (globals: SiteAppGlobals) => void;
    };
};
export type SiteApp = {
    id: string;
    loaded: boolean;
    errored: boolean;
    processedBuffer: boolean;
    processEvent?: (globals: SiteAppGlobals) => void;
};
export interface PersistentStore {
    _is_supported: () => boolean;
    _error: (error: any) => void;
    _parse: (name: string) => any;
    _get: (name: string) => any;
    _set: (name: string, value: any, expire_days?: number | null, cross_subdomain?: boolean, secure?: boolean, debug?: boolean) => void;
    _remove: (name: string, cross_subdomain?: boolean) => void;
}
export type EventHandler = (event: Event) => boolean | void;
export type SnippetArrayItem = [method: string, ...args: any[]];
export type NetworkRecordOptions = {
    initiatorTypes?: InitiatorType[];
    maskRequestFn?: (data: CapturedNetworkRequest) => CapturedNetworkRequest | undefined;
    recordHeaders?: boolean | {
        request: boolean;
        response: boolean;
    };
    recordBody?: boolean | string[] | {
        request: boolean | string[];
        response: boolean | string[];
    };
    recordInitialRequests?: boolean;
    /**
     * whether to record PerformanceEntry events for network requests
     */
    recordPerformance?: boolean;
    /**
     * the PerformanceObserver will only observe these entry types
     */
    performanceEntryTypeToObserve: string[];
    /**
     * the maximum size of the request/response body to record
     * NB this will be at most 1MB even if set larger
     */
    payloadSizeLimitBytes: number;
    /**
     * some domains we should never record the payload
     * for example other companies session replay ingestion payloads aren't super useful but are gigantic
     * if this isn't provided we use a default list
     * if this is provided - we add the provided list to the default list
     * i.e. we never record the payloads on the default deny list
     */
    payloadHostDenyList?: string[];
};
export type ErrorEventArgs = [
    event: string | Event,
    source?: string | undefined,
    lineno?: number | undefined,
    colno?: number | undefined,
    error?: Error | undefined
];
export declare const severityLevels: readonly ["fatal", "error", "warning", "log", "info", "debug"];
export interface SessionRecordingUrlTrigger {
    url: string;
    matching: 'regex';
}
export type PropertyMatchType = 'regex' | 'not_regex' | 'exact' | 'is_not' | 'icontains' | 'not_icontains';
export interface ErrorTrackingSuppressionRule {
    type: 'AND' | 'OR';
    values: ErrorTrackingSuppressionRuleValue[];
}
export interface ErrorTrackingSuppressionRuleValue {
    key: '$exception_types' | '$exception_values';
    operator: PropertyMatchType;
    value: string | string[];
    type: string;
}
export type SessionStartReason = 'sampling_overridden' | 'recording_initialized' | 'linked_flag_matched' | 'linked_flag_overridden' | typeof SAMPLED | 'session_id_changed' | 'url_trigger_matched' | 'event_trigger_matched';
export type OverrideConfig = {
    sampling: boolean;
    linked_flag: boolean;
    url_trigger: boolean;
    event_trigger: boolean;
};
export declare const Compression: {
    readonly GZipJS: "gzip-js";
    readonly Base64: "base64";
};
export type Compression = (typeof Compression)[keyof typeof Compression];
