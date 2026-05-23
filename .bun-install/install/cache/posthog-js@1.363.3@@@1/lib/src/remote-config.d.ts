import { PostHog } from './posthog-core';
import { RemoteConfig } from './types';
export declare class RemoteConfigLoader {
    private readonly _instance;
    private _refreshInterval;
    constructor(_instance: PostHog);
    get remoteConfig(): RemoteConfig | undefined;
    private _loadRemoteConfigJs;
    private _loadRemoteConfigJSON;
    load(): void;
    stop(): void;
    /**
     * Refresh feature flags for long-running sessions.
     * Calls reloadFeatureFlags() directly rather than re-fetching config — the initial
     * config load already determined whether flags are enabled, and reloadFeatureFlags()
     * is a no-op when flags are disabled. This avoids an unnecessary network round-trip.
     */
    refresh(): void;
    private _startRefreshInterval;
    private _onRemoteConfig;
}
