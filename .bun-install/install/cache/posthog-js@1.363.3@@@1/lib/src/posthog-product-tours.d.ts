import { PostHog } from './posthog-core';
import { ProductTour, ProductTourCallback } from './posthog-product-tours-types';
import { RemoteConfig } from './types';
import { Extension } from './extensions/types';
export declare class PostHogProductTours implements Extension {
    private _instance;
    private _productTourManager;
    private _cachedTours;
    private get _persistence();
    constructor(instance: PostHog);
    initialize(): void;
    onRemoteConfig(response: RemoteConfig): void;
    loadIfEnabled(): void;
    private _loadScript;
    private _startProductTours;
    getProductTours(callback: ProductTourCallback, forceReload?: boolean): void;
    getActiveProductTours(callback: ProductTourCallback): void;
    showProductTour(tourId: string): void;
    previewTour(tour: ProductTour): void;
    dismissProductTour(): void;
    nextStep(): void;
    previousStep(): void;
    clearCache(): void;
    resetTour(tourId: string): void;
    resetAllTours(): void;
    cancelPendingTour(tourId: string): void;
}
