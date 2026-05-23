import RageClick from './extensions/rageclick';
import { Properties, RemoteConfig } from './types';
import { PostHog } from './posthog-core';
import type { Extension } from './extensions/types';
type HeatmapEventBuffer = {
    [key: string]: Properties[];
} | undefined;
export declare class Heatmaps implements Extension {
    instance: PostHog;
    rageclicks: RageClick;
    _enabledServerSide: boolean;
    private get _config();
    _initialized: boolean;
    _mouseMoveTimeout: ReturnType<typeof setTimeout> | undefined;
    private _buffer;
    private _flushInterval;
    private _deadClicksCapture;
    private _onClickHandler;
    private _onMouseMoveHandler;
    private _flushHandler;
    private _onVisibilityChange_handler;
    constructor(instance: PostHog);
    initialize(): void;
    get flushIntervalMilliseconds(): number;
    get isEnabled(): boolean;
    startIfEnabled(): void;
    onRemoteConfig(response: RemoteConfig): void;
    getAndClearBuffer(): HeatmapEventBuffer;
    private _onDeadClick;
    private _onVisibilityChange;
    private _setupListeners;
    private _removeListeners;
    private _getProperties;
    private _onClick;
    private _onMouseMove;
    private _capture;
    private _flush;
}
export {};
