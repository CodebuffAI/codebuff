import { PostHog } from './posthog-core';
import { RemoteConfig } from './types';
import { Extension } from './extensions/types';
export declare class PostHogLogs implements Extension {
    private readonly _instance;
    private _isLogsEnabled;
    private _isLoaded;
    constructor(_instance: PostHog);
    initialize(): void;
    onRemoteConfig(response: RemoteConfig): void;
    reset(): void;
    loadIfEnabled(): void;
}
