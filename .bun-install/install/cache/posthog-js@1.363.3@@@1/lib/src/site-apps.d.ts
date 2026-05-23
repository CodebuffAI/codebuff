import type { Extension } from './extensions/types';
import { PostHog } from './posthog-core';
import { CaptureResult, RemoteConfig, SiteApp, SiteAppGlobals, SiteAppLoader } from './types';
export declare class SiteApps implements Extension {
    private _instance;
    apps: Record<string, SiteApp>;
    private _stopBuffering?;
    private _bufferedInvocations;
    constructor(_instance: PostHog);
    get isEnabled(): boolean;
    private _eventCollector;
    get siteAppLoaders(): SiteAppLoader[] | undefined;
    initialize(): void;
    globalsForEvent(event: CaptureResult): SiteAppGlobals;
    setupSiteApp(loader: SiteAppLoader): void;
    private _setupSiteApps;
    private _onCapturedEvent;
    onRemoteConfig(response: RemoteConfig): void;
}
