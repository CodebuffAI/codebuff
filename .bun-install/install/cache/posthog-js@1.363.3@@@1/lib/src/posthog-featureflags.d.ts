import { PostHog } from './posthog-core';
import { FlagsResponse, FeatureFlagsCallback, EarlyAccessFeatureCallback, Properties, JsonType, RemoteConfigFeatureFlagCallback, EarlyAccessFeatureStage, FeatureFlagDetail, FeatureFlagResult, FeatureFlagOptions, OverrideFeatureFlagsOptions } from './types';
import { PostHogPersistence } from './posthog-persistence';
import type { Extension } from './extensions/types';
/**
 * Error type constants for the $feature_flag_error property.
 *
 * These values are sent in analytics events to track flag evaluation failures.
 * They should not be changed without considering impact on existing dashboards
 * and queries that filter on these values.
 */
export declare const FeatureFlagError: {
    readonly ERRORS_WHILE_COMPUTING: "errors_while_computing_flags";
    readonly FLAG_MISSING: "flag_missing";
    readonly QUOTA_LIMITED: "quota_limited";
    readonly TIMEOUT: "timeout";
    readonly CONNECTION_ERROR: "connection_error";
    readonly UNKNOWN_ERROR: "unknown_error";
    readonly apiError: (status: number | string) => string;
};
export declare const filterActiveFeatureFlags: (featureFlags?: Record<string, string | boolean>) => Record<string, string | boolean>;
export declare const parseFlagsResponse: (response: Partial<FlagsResponse>, persistence: PostHogPersistence, currentFlags?: Record<string, string | boolean>, currentFlagPayloads?: Record<string, JsonType>, currentFlagDetails?: Record<string, FeatureFlagDetail>) => void;
export declare const QuotaLimitedResource: {
    readonly FeatureFlags: "feature_flags";
    readonly Recordings: "recordings";
};
export type QuotaLimitedResource = (typeof QuotaLimitedResource)[keyof typeof QuotaLimitedResource];
export declare class PostHogFeatureFlags implements Extension {
    private _instance;
    _override_warning: boolean;
    featureFlagEventHandlers: FeatureFlagsCallback[];
    $anon_distinct_id: string | undefined;
    private _hasLoadedFlags;
    private _requestInFlight;
    private _reloadingDisabled;
    private _additionalReloadRequested;
    private _reloadDebouncer?;
    private _flagsLoadedFromRemote;
    private _hasLoggedDeprecationWarning;
    private _staleCacheRefreshTriggered;
    constructor(_instance: PostHog);
    private get _config();
    private get _persistence();
    private _prop;
    /**
     * Check if the feature flag cache is stale based on the configured TTL.
     */
    private _isCacheStale;
    /**
     * Triggers a debounced reload when cache staleness is first detected.
     * Returns true if cache is stale, false otherwise.
     */
    private _checkAndTriggerStaleRefresh;
    private _getValidEvaluationEnvironments;
    private _shouldIncludeEvaluationEnvironments;
    initialize(): void;
    updateFlags(flags: Record<string, boolean | string>, payloads?: Record<string, JsonType>, options?: {
        merge?: boolean;
    }): void;
    get hasLoadedFlags(): boolean;
    getFlags(): string[];
    getFlagsWithDetails(): Record<string, FeatureFlagDetail>;
    getFlagVariants(): Record<string, string | boolean>;
    getFlagPayloads(): Record<string, JsonType>;
    /**
     * Reloads feature flags asynchronously.
     *
     * Constraints:
     *
     * 1. Avoid parallel requests
     * 2. Delay a few milliseconds after each reloadFeatureFlags call to batch subsequent changes together
     */
    reloadFeatureFlags(): void;
    private _clearDebouncer;
    ensureFlagsLoaded(): void;
    setAnonymousDistinctId(anon_distinct_id: string): void;
    setReloadingPaused(isPaused: boolean): void;
    _callFlagsEndpoint(options?: {
        disableFlags?: boolean;
    }): void;
    /**
     * Get feature flag's value for user.
     *
     * By default, this method may return cached values from localStorage if the `/flags` endpoint
     * hasn't responded yet. This reduces flicker but means you might briefly see stale values
     * (e.g., a flag that was disabled on the server).
     *
     * ### Usage:
     *
     *     if(posthog.getFeatureFlag('my-flag') === 'some-variant') { // do something }
     *
     *     // Only use fresh values from the server (returns undefined until /flags responds)
     *     if(posthog.getFeatureFlag('my-flag', { fresh: true }) === 'some-variant') { // do something }
     *
     * @param {String} key Key of the feature flag.
     * @param {Object} options Optional settings.
     * @param {boolean} [options.send_event=true] If false, won't send a $feature_flag_called event to PostHog.
     * @param {boolean} [options.fresh=false] If true, only returns values loaded from the server, not cached localStorage values.
     *                  Use this when you need to ensure the flag value reflects the current server state,
     *                  such as after disabling a flag. Returns undefined until the /flags endpoint responds.
     * @returns {boolean | string | undefined} The flag value, or undefined if not found or not yet loaded.
     */
    getFeatureFlag(key: string, options?: FeatureFlagOptions): boolean | string | undefined;
    getFeatureFlagDetails(key: string): FeatureFlagDetail | undefined;
    /**
     * @deprecated Use `getFeatureFlagResult()` instead which properly tracks the feature flag call.
     * `getFeatureFlagPayload()` does not emit the `$feature_flag_called` event which may result in
     * missing analytics. This method will be removed in a future version.
     */
    getFeatureFlagPayload(key: string): JsonType;
    /**
     * Get a feature flag result including both the flag value and payload, while properly tracking the call.
     * This method emits the `$feature_flag_called` event by default.
     *
     * By default, this method may return cached values from localStorage if the `/flags` endpoint
     * hasn't responded yet. This reduces flicker but means you might briefly see stale values
     * (e.g., a flag that was disabled on the server).
     *
     * ### Usage:
     *
     *     const result = posthog.getFeatureFlagResult('my-flag')
     *     if (result?.enabled) {
     *         console.log('Flag is enabled with payload:', result.payload)
     *     }
     *
     *     // Only use fresh values from the server
     *     const freshResult = posthog.getFeatureFlagResult('my-flag', { fresh: true })
     *
     * @param {String} key Key of the feature flag.
     * @param {Object} [options] Options for the feature flag lookup.
     * @param {boolean} [options.send_event=true] If false, won't send the $feature_flag_called event.
     * @param {boolean} [options.fresh=false] If true, only returns values loaded from the server, not cached localStorage values.
     *                  Use this when you need to ensure the flag value reflects the current server state.
     *                  Returns undefined until the /flags endpoint responds.
     * @returns {FeatureFlagResult | undefined} The feature flag result including key, enabled, variant, and payload.
     */
    getFeatureFlagResult(key: string, options?: FeatureFlagOptions): FeatureFlagResult | undefined;
    getRemoteConfigPayload(key: string, callback: RemoteConfigFeatureFlagCallback): void;
    /**
     * See if feature flag is enabled for user.
     *
     * By default, this method may return cached values from localStorage if the `/flags` endpoint
     * hasn't responded yet. This reduces flicker but means you might briefly see stale values
     * (e.g., a flag that was disabled on the server).
     *
     * ### Usage:
     *
     *     if(posthog.isFeatureEnabled('beta-feature')) { // do something }
     *
     *     // Only use fresh values from the server
     *     if(posthog.isFeatureEnabled('beta-feature', { fresh: true })) { // do something }
     *
     * @param {String} key Key of the feature flag.
     * @param {Object} [options] Optional settings.
     * @param {boolean} [options.send_event=true] If false, won't send a $feature_flag_called event to PostHog.
     * @param {boolean} [options.fresh=false] If true, only returns values loaded from the server, not cached localStorage values.
     *                  Use this when you need to ensure the flag value reflects the current server state.
     *                  Returns undefined until the /flags endpoint responds.
     * @returns {boolean | undefined} Whether the flag is enabled, or undefined if not found or not yet loaded.
     */
    isFeatureEnabled(key: string, options?: FeatureFlagOptions): boolean | undefined;
    addFeatureFlagsHandler(handler: FeatureFlagsCallback): void;
    removeFeatureFlagsHandler(handler: FeatureFlagsCallback): void;
    receivedFeatureFlags(response: Partial<FlagsResponse>, errorsLoading?: boolean): void;
    /**
     * @deprecated Use overrideFeatureFlags instead. This will be removed in a future version.
     */
    override(flags: boolean | string[] | Record<string, string | boolean>, suppressWarning?: boolean): void;
    /**
     * Override feature flags on the client-side. Useful for setting non-persistent feature flags,
     * or for testing/debugging feature flags in the PostHog app.
     *
     * ### Usage:
     *
     *     - posthog.featureFlags.overrideFeatureFlags(false) // clear all overrides
     *     - posthog.featureFlags.overrideFeatureFlags(['beta-feature']) // enable flags
     *     - posthog.featureFlags.overrideFeatureFlags({'beta-feature': 'variant'}) // set variants
     *     - posthog.featureFlags.overrideFeatureFlags({ flags: ['beta-feature'] }) // enable flags
     *     - posthog.featureFlags.overrideFeatureFlags({ flags: {'beta-feature': 'variant'} }) // set variants
     *     - posthog.featureFlags.overrideFeatureFlags({ // set both flags and payloads
     *         flags: {'beta-feature': 'variant'},
     *         payloads: { 'beta-feature': { someData: true } }
     *       })
     *     - posthog.featureFlags.overrideFeatureFlags({ // only override payloads
     *         payloads: { 'beta-feature': { someData: true } }
     *       })
     */
    overrideFeatureFlags(overrideOptions: OverrideFeatureFlagsOptions): void;
    onFeatureFlags(callback: FeatureFlagsCallback): () => void;
    updateEarlyAccessFeatureEnrollment(key: string, isEnrolled: boolean, stage?: string): void;
    getEarlyAccessFeatures(callback: EarlyAccessFeatureCallback, force_reload?: boolean, stages?: EarlyAccessFeatureStage[]): void;
    _prepareFeatureFlagsForCallbacks(): {
        flags: string[];
        flagVariants: Record<string, string | boolean>;
    };
    _fireFeatureFlagsCallbacks(errorsLoading?: boolean): void;
    /**
     * Set override person properties for feature flags.
     * This is used when dealing with new persons / where you don't want to wait for ingestion
     * to update user properties.
     */
    setPersonPropertiesForFlags(properties: Properties, reloadFeatureFlags?: boolean): void;
    resetPersonPropertiesForFlags(): void;
    /**
     * Set override group properties for feature flags.
     * This is used when dealing with new groups / where you don't want to wait for ingestion
     * to update properties.
     * Takes in an object, the key of which is the group type.
     * For example:
     *     setGroupPropertiesForFlags({'organization': { name: 'CYZ', employees: '11' } })
     */
    setGroupPropertiesForFlags(properties: {
        [type: string]: Properties;
    }, reloadFeatureFlags?: boolean): void;
    resetGroupPropertiesForFlags(group_type?: string): void;
    reset(): void;
}
