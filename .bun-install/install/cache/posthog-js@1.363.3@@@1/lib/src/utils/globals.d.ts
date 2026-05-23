import type { PostHog } from '../posthog-core';
import { SessionIdManager } from '../sessionid';
import { DeadClicksAutoCaptureConfig, ExternalIntegrationKind, Properties, RemoteConfig, SiteAppLoader, SessionStartReason } from '../types';
import type { ConversationsRemoteConfig, GetMessagesResponse, GetTicketsOptions, GetTicketsResponse, MarkAsReadResponse, RestoreFromTokenResponse, RequestRestoreLinkResponse, SendMessageResponse, UserProvidedTraits } from '../posthog-conversations-types';
import type { SessionRecordingStatus, TriggerType } from '../extensions/replay/external/triggerMatching';
import { eventWithTime } from '../extensions/replay/types/rrweb-types';
import { ErrorTracking } from '@posthog/core';
declare const win: (Window & typeof globalThis) | undefined;
export type AssignableWindow = Window & typeof globalThis & {
    posthog: any;
    __PosthogExtensions__?: PostHogExtensions;
    /**
     * When loading remote config, we assign it to this global configuration
     * for ease of sharing it with the rest of the SDK
     */
    _POSTHOG_REMOTE_CONFIG?: Record<string, {
        config: RemoteConfig;
        siteApps: SiteAppLoader[];
    }>;
    /**
     * If this is set on the window, our logger will log to the console
     * for ease of debugging. Used for testing purposes only.
     *
     * @see {Config.DEBUG} from config.ts
     */
    POSTHOG_DEBUG: any;
    doNotTrack: any;
    posthogCustomizations: any;
    /**
     * This is a legacy way to expose these functions, but we still need to support it for backwards compatibility
     * Can be removed once we drop support for 1.161.1
     *
     * See entrypoints/exception-autocapture.ts
     *
     * @deprecated use `__PosthogExtensions__.errorWrappingFunctions` instead
     */
    posthogErrorWrappingFunctions: any;
    /**
     * This is a legacy way to expose these functions, but we still need to support it for backwards compatibility
     * Can be removed once we drop support for 1.161.1
     *
     * See entrypoints/posthog-recorder.ts
     *
     * @deprecated use `__PosthogExtensions__.rrweb` instead
     */
    rrweb: any;
    /**
     * This is a legacy way to expose these functions, but we still need to support it for backwards compatibility
     * Can be removed once we drop support for 1.161.1
     *
     * See entrypoints/posthog-recorder.ts
     *
     * @deprecated use `__PosthogExtensions__.rrwebConsoleRecord` instead
     */
    rrwebConsoleRecord: any;
    /**
     * This is a legacy way to expose these functions, but we still need to support it for backwards compatibility
     * Can be removed once we drop support for 1.161.1
     *
     * See entrypoints/posthog-recorder.ts
     *
     * @deprecated use `__PosthogExtensions__.getRecordNetworkPlugin` instead
     */
    getRecordNetworkPlugin: any;
    /**
     * This is a legacy way to expose these functions, but we still need to support it for backwards compatibility
     * Can be removed once we drop support for 1.161.1
     *
     * See entrypoints/web-vitals.ts
     *
     * @deprecated use `__PosthogExtensions__.postHogWebVitalsCallbacks` instead
     */
    postHogWebVitalsCallbacks: any;
    /**
     * This is a legacy way to expose these functions, but we still need to support it for backwards compatibility
     * Can be removed once we drop support for 1.161.1
     *
     * See entrypoints/tracing-headers.ts
     *
     * @deprecated use `__PosthogExtensions__.postHogTracingHeadersPatchFns` instead
     */
    postHogTracingHeadersPatchFns: any;
    /**
     * This is a legacy way to expose these functions, but we still need to support it for backwards compatibility
     * Can be removed once we drop support for 1.161.1
     *
     * See entrypoints/surveys.ts
     *
     * @deprecated use `__PosthogExtensions__.generateSurveys` instead
     */
    extendPostHogWithSurveys: any;
    ph_load_toolbar: any;
    ph_load_editor: any;
    ph_toolbar_state: any;
} & Record<`__$$ph_site_app_${string}`, any>;
/**
 * This is our contract between (potentially) lazily loaded extensions and the SDK
 * changes to this interface can be breaking changes for users of the SDK
 */
export type ExternalExtensionKind = 'intercom-integration' | 'crisp-chat-integration';
export type PostHogExtensionKind = 'toolbar' | 'exception-autocapture' | 'web-vitals' | 'web-vitals-with-attribution' | 'recorder' | 'lazy-recorder' | 'tracing-headers' | 'surveys' | 'logs' | 'conversations' | 'product-tours' | 'dead-clicks-autocapture' | 'remote-config' | ExternalExtensionKind;
export interface LazyLoadedSessionRecordingInterface {
    start: (startReason?: SessionStartReason) => void;
    stop: () => void;
    discard: () => void;
    sessionId: string;
    status: SessionRecordingStatus;
    onRRwebEmit: (rawEvent: eventWithTime) => void;
    log: (message: string, level: 'log' | 'warn' | 'error') => void;
    sdkDebugProperties: Properties;
    overrideLinkedFlag: () => void;
    overrideSampling: () => void;
    overrideTrigger: (triggerType: TriggerType) => void;
    isStarted: boolean;
    tryAddCustomEvent(tag: string, payload: any): boolean;
}
export interface LazyLoadedDeadClicksAutocaptureInterface {
    start: (observerTarget: Node) => void;
    stop: () => void;
}
export interface LazyLoadedConversationsInterface {
    show: () => void;
    hide: () => void;
    isVisible: () => boolean;
    reset: () => void;
    sendMessage: (message: string, userTraits?: UserProvidedTraits, newTicket?: boolean) => Promise<SendMessageResponse>;
    getMessages: (ticketId?: string, after?: string) => Promise<GetMessagesResponse>;
    markAsRead: (ticketId?: string) => Promise<MarkAsReadResponse>;
    getTickets: (options?: GetTicketsOptions) => Promise<GetTicketsResponse>;
    requestRestoreLink: (email: string) => Promise<RequestRestoreLinkResponse>;
    restoreFromToken: (restoreToken: string) => Promise<RestoreFromTokenResponse>;
    restoreFromUrlToken: () => Promise<RestoreFromTokenResponse | null>;
    getCurrentTicketId: () => string | null;
    getWidgetSessionId: () => string;
}
interface PostHogExtensions {
    loadExternalDependency?: (posthog: PostHog, kind: PostHogExtensionKind, callback: (error?: string | Event, event?: Event) => void) => void;
    loadSiteApp?: (posthog: PostHog, appUrl: string, callback: (error?: string | Event, event?: Event) => void) => void;
    errorWrappingFunctions?: {
        wrapOnError: (captureFn: (props: ErrorTracking.ErrorProperties) => void) => () => void;
        wrapUnhandledRejection: (captureFn: (props: ErrorTracking.ErrorProperties) => void) => () => void;
        wrapConsoleError: (captureFn: (props: ErrorTracking.ErrorProperties) => void) => () => void;
    };
    rrweb?: {
        record: any;
        version: string;
        wasMaxDepthReached?: () => boolean;
        resetMaxDepthState?: () => void;
    };
    rrwebPlugins?: {
        getRecordConsolePlugin: any;
        getRecordNetworkPlugin?: any;
    };
    generateSurveys?: (posthog: PostHog, isSurveysEnabled: boolean) => any | undefined;
    generateProductTours?: (posthog: PostHog, isEnabled: boolean) => any | undefined;
    logs?: {
        initializeLogs?: (posthog: PostHog) => any | undefined;
    };
    postHogWebVitalsCallbacks?: {
        onLCP: (metric: any) => void;
        onCLS: (metric: any) => void;
        onFCP: (metric: any) => void;
        onINP: (metric: any) => void;
    };
    /**
     * @deprecated
     *
     * this was introduced briefly, it is now always a no-op and only kept for backwards compatibility
     */
    loadWebVitalsCallbacks?: (useAttribution?: boolean) => PostHogExtensions['postHogWebVitalsCallbacks'];
    tracingHeadersPatchFns?: {
        _patchFetch: (hostnames: string[], distinctId: string, sessionManager?: SessionIdManager) => () => void;
        _patchXHR: (hostnames: string[], distinctId: string, sessionManager?: SessionIdManager) => () => void;
    };
    initDeadClicksAutocapture?: (ph: PostHog, config: DeadClicksAutoCaptureConfig) => LazyLoadedDeadClicksAutocaptureInterface;
    integrations?: {
        [K in ExternalIntegrationKind]?: {
            start: (posthog: PostHog) => void;
            stop: () => void;
        };
    };
    initSessionRecording?: (ph: PostHog) => LazyLoadedSessionRecordingInterface;
    initConversations?: (config: ConversationsRemoteConfig, posthog: PostHog) => LazyLoadedConversationsInterface;
}
export declare const navigator: Navigator | undefined;
export declare const document: Document | undefined;
export declare const location: Location | undefined;
export declare const fetch: typeof globalThis.fetch | undefined;
export declare const XMLHttpRequest: {
    new (): XMLHttpRequest;
    prototype: XMLHttpRequest;
    readonly UNSENT: 0;
    readonly OPENED: 1;
    readonly HEADERS_RECEIVED: 2;
    readonly LOADING: 3;
    readonly DONE: 4;
} | undefined;
export declare const AbortController: {
    new (): AbortController;
    prototype: AbortController;
} | undefined;
export declare const userAgent: string | undefined;
export declare const assignableWindow: AssignableWindow;
export { win as window };
