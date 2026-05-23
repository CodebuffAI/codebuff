/**
 * @posthog/types - Type definitions for the PostHog JavaScript SDK
 *
 * This package provides TypeScript type definitions for the PostHog SDK,
 * allowing you to type the PostHog instance and its configuration options.
 */

// PostHog instance type
export type { PostHog } from './posthog'

// Common types
export type { Property, Properties, JsonType, JsonRecord } from './common'

// Capture types
export type {
    KnownEventName,
    KnownUnsafeEditableEvent,
    EventName,
    CaptureResult,
    CaptureOptions,
    BeforeSendFn,
} from './capture'

// Feature flag types
export type {
    FeatureFlagsCallback,
    FeatureFlagDetail,
    FeatureFlagMetadata,
    EvaluationReason,
    FeatureFlagResult,
    FeatureFlagOptions,
    RemoteConfigFeatureFlagCallback,
    EarlyAccessFeature,
    EarlyAccessFeatureStage,
    EarlyAccessFeatureCallback,
    EarlyAccessFeatureResponse,
    FeatureFlagOverrides,
    FeatureFlagPayloadOverrides,
    FeatureFlagOverrideOptions,
    OverrideFeatureFlagsOptions,
} from './feature-flags'

// Request types
export type { Headers, RequestResponse, RequestCallback } from './request'

// Session recording types
export type {
    SessionRecordingCanvasOptions,
    InitiatorType,
    NetworkRequest,
    CapturedNetworkRequest,
    SessionIdChangedCallback,
    SeverityLevel,
} from './session-recording'

// Config types
export type {
    AutocaptureCompatibleElement,
    DomAutocaptureEvents,
    AutocaptureConfig,
    RageclickConfig,
    BootstrapConfig,
    SupportedWebVitalsMetrics,
    PerformanceCaptureConfig,
    DeadClickCandidate,
    ExceptionAutoCaptureConfig,
    DeadClicksAutoCaptureConfig,
    HeatmapConfig,
    ConfigDefaults,
    ExternalIntegrationKind,
    ErrorTrackingOptions,
    MaskInputOptions,
    SlimDOMOptions,
    SessionRecordingOptions,
    RequestQueueConfig,
    PostHogConfig,
} from './posthog-config'

// Segment integration types
export type { SegmentUser, SegmentAnalytics, SegmentPlugin, SegmentContext, SegmentFunction } from './segment'

// Survey types
export type { SurveyRenderReason } from './survey'

// Toolbar types
export type { ToolbarParams, ToolbarUserIntent, ToolbarSource, ToolbarVersion } from './toolbar'

// Tree-shakeable extension types
export type { TreeShakeableConfig, TreeShakeable } from './tree-shakeable'
