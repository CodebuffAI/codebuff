import type { PostHog } from '../posthog-core';
import type { RemoteConfig } from '../types';
export type ExtensionConstructor<T extends Extension> = new (instance: PostHog, ...args: any[]) => T;
export interface Extension {
    initialize?(): boolean | void;
    onRemoteConfig?(config: RemoteConfig): void;
}
