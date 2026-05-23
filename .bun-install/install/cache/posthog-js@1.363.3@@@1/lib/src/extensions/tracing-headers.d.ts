import { PostHog } from '../posthog-core';
import type { Extension } from './types';
export declare class TracingHeaders implements Extension {
    private readonly _instance;
    private _restoreXHRPatch;
    private _restoreFetchPatch;
    constructor(_instance: PostHog);
    initialize(): void;
    private _loadScript;
    startIfEnabledOrStop(): void;
    private _startCapturing;
}
