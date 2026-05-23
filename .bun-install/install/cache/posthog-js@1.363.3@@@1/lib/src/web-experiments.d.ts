import { PostHog } from './posthog-core';
import { WebExperimentsCallback, WebExperimentUrlMatchType } from './web-experiments-types';
import { Extension } from './extensions/types';
export declare const webExperimentUrlValidationMap: Record<WebExperimentUrlMatchType, (conditionsUrl: string, location: Location) => boolean>;
export declare class WebExperiments implements Extension {
    private _instance;
    private _flagToExperiments?;
    private get _config();
    constructor(_instance: PostHog);
    initialize(): void;
    onFeatureFlags(flags: string[]): void;
    previewWebExperiment(): void;
    loadIfEnabled(): void;
    getWebExperimentsAndEvaluateDisplayLogic: (forceReload?: boolean) => void;
    getWebExperiments(callback: WebExperimentsCallback, forceReload: boolean, previewing?: boolean): void;
    private _showPreviewWebExperiment;
    private static _matchesTestVariant;
    private static _matchUrlConditions;
    static getWindowLocation(): Location | undefined;
    private static _matchUTMConditions;
    private static _logInfo;
    private _applyTransforms;
    _is_bot(): boolean | undefined;
}
