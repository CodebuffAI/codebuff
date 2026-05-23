"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRecording = void 0;
var constants_1 = require("../../constants");
var remote_config_1 = require("../../remote-config");
var core_1 = require("@posthog/core");
var logger_1 = require("../../utils/logger");
var globals_1 = require("../../utils/globals");
var lazy_loaded_session_recorder_1 = require("./external/lazy-loaded-session-recorder");
var triggerMatching_1 = require("./external/triggerMatching");
var LOGGER_PREFIX = '[SessionRecording]';
var logger = (0, logger_1.createLogger)(LOGGER_PREFIX);
var SessionRecording = /** @class */ (function () {
    function SessionRecording(_instance) {
        this._instance = _instance;
        this._forceAllowLocalhostNetworkCapture = false;
        this._recordingStatus = triggerMatching_1.DISABLED;
        this._persistFlagsOnSessionListener = undefined;
        if (!this._instance.sessionManager) {
            logger.error('started without valid sessionManager');
            throw new Error(LOGGER_PREFIX + ' started without valid sessionManager. This is a bug.');
        }
        if (this._config.cookieless_mode === constants_1.COOKIELESS_ALWAYS) {
            throw new Error(LOGGER_PREFIX + ' cannot be used with cookieless_mode="always"');
        }
    }
    Object.defineProperty(SessionRecording.prototype, "_config", {
        get: function () {
            return this._instance.config;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SessionRecording.prototype, "_persistence", {
        get: function () {
            return this._instance.persistence;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SessionRecording.prototype, "started", {
        get: function () {
            var _a;
            return !!((_a = this._lazyLoadedSessionRecording) === null || _a === void 0 ? void 0 : _a.isStarted);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SessionRecording.prototype, "status", {
        get: function () {
            var _a, _b;
            if (this._recordingStatus === triggerMatching_1.AWAITING_CONFIG || this._recordingStatus === triggerMatching_1.MISSING_CONFIG) {
                return this._recordingStatus;
            }
            return (_b = (_a = this._lazyLoadedSessionRecording) === null || _a === void 0 ? void 0 : _a.status) !== null && _b !== void 0 ? _b : this._recordingStatus;
        },
        enumerable: false,
        configurable: true
    });
    SessionRecording.prototype.initialize = function () {
        this.startIfEnabledOrStop();
    };
    Object.defineProperty(SessionRecording.prototype, "_isRecordingEnabled", {
        get: function () {
            var _a;
            var enabled_server_side = !!((_a = this._instance.get_property(constants_1.SESSION_RECORDING_REMOTE_CONFIG)) === null || _a === void 0 ? void 0 : _a.enabled);
            var enabled_client_side = !this._config.disable_session_recording;
            var isDisabled = this._config.disable_session_recording || this._instance.consent.isOptedOut();
            return globals_1.window && enabled_server_side && enabled_client_side && !isDisabled;
        },
        enumerable: false,
        configurable: true
    });
    SessionRecording.prototype.startIfEnabledOrStop = function (startReason) {
        var _a;
        if (this._isRecordingEnabled && ((_a = this._lazyLoadedSessionRecording) === null || _a === void 0 ? void 0 : _a.isStarted)) {
            return;
        }
        // According to the rrweb docs, rrweb is not supported on IE11 and below:
        // "rrweb does not support IE11 and below because it uses the MutationObserver API, which was supported by these browsers."
        // https://github.com/rrweb-io/rrweb/blob/master/guide.md#compatibility-note
        //
        // However, MutationObserver does exist on IE11, it just doesn't work well and does not detect all changes.
        // Instead, when we load "recorder.js", the first JS error is about "Object.assign" and "Array.from" being undefined.
        // Thus instead of MutationObserver, we look for this function and block recording if it's undefined.
        var canRunReplay = !(0, core_1.isUndefined)(Object.assign) && !(0, core_1.isUndefined)(Array.from);
        if (this._isRecordingEnabled && canRunReplay) {
            this._lazyLoadAndStart(startReason);
            logger.info('starting');
        }
        else {
            this._recordingStatus = triggerMatching_1.DISABLED;
            this.stopRecording();
        }
    };
    /**
     * session recording waits until it receives remote config before loading the script
     * this is to ensure we can control the script name remotely
     * and because we wait until we have local and remote config to determine if we should start at all
     * if start is called and there is no remote config then we wait until there is
     */
    SessionRecording.prototype._lazyLoadAndStart = function (startReason) {
        var _this = this;
        var _a, _b, _c, _d, _e;
        // by checking `_isRecordingEnabled` here we know that
        // we have stored remote config and client config to read
        // replay waits for both local and remote config before starting
        if (!this._isRecordingEnabled) {
            return;
        }
        if (this._recordingStatus !== triggerMatching_1.AWAITING_CONFIG && this._recordingStatus !== triggerMatching_1.MISSING_CONFIG) {
            this._recordingStatus = triggerMatching_1.LAZY_LOADING;
        }
        // If recorder.js is already loaded (if array.full.js snippet is used or posthog-js/dist/recorder is
        // imported), don't load the script. Otherwise, remotely import recorder.js from cdn since it hasn't been loaded.
        if (!((_b = (_a = globals_1.assignableWindow === null || globals_1.assignableWindow === void 0 ? void 0 : globals_1.assignableWindow.__PosthogExtensions__) === null || _a === void 0 ? void 0 : _a.rrweb) === null || _b === void 0 ? void 0 : _b.record) ||
            !((_c = globals_1.assignableWindow.__PosthogExtensions__) === null || _c === void 0 ? void 0 : _c.initSessionRecording)) {
            (_e = (_d = globals_1.assignableWindow.__PosthogExtensions__) === null || _d === void 0 ? void 0 : _d.loadExternalDependency) === null || _e === void 0 ? void 0 : _e.call(_d, this._instance, this._scriptName, function (err) {
                if (err) {
                    return logger.error('could not load recorder', err);
                }
                _this._onScriptLoaded(startReason);
            });
        }
        else {
            this._onScriptLoaded(startReason);
        }
    };
    SessionRecording.prototype.stopRecording = function () {
        var _a, _b;
        (_a = this._persistFlagsOnSessionListener) === null || _a === void 0 ? void 0 : _a.call(this);
        this._persistFlagsOnSessionListener = undefined;
        (_b = this._lazyLoadedSessionRecording) === null || _b === void 0 ? void 0 : _b.stop();
    };
    SessionRecording.prototype._discardRecording = function () {
        var _a, _b;
        (_a = this._persistFlagsOnSessionListener) === null || _a === void 0 ? void 0 : _a.call(this);
        this._persistFlagsOnSessionListener = undefined;
        (_b = this._lazyLoadedSessionRecording) === null || _b === void 0 ? void 0 : _b.discard();
    };
    SessionRecording.prototype._resetSampling = function () {
        var _a;
        (_a = this._persistence) === null || _a === void 0 ? void 0 : _a.unregister(constants_1.SESSION_RECORDING_IS_SAMPLED);
    };
    SessionRecording.prototype._validateSampleRate = function (rate, source) {
        if ((0, core_1.isNullish)(rate)) {
            return null;
        }
        var parsed = (0, core_1.isNumber)(rate) ? rate : parseFloat(rate);
        if (!(0, core_1.isValidSampleRate)(parsed)) {
            logger.warn("".concat(source, " must be between 0 and 1. Ignoring invalid value:"), rate);
            return null;
        }
        return parsed;
    };
    SessionRecording.prototype._persistRemoteConfig = function (response) {
        var _this = this;
        var _a, _b;
        if (this._persistence) {
            var persistence_1 = this._persistence;
            var persistResponse = function () {
                var _a;
                var _b;
                var sessionRecordingConfigResponse = response.sessionRecording === false ? undefined : response.sessionRecording;
                var localSampleRate = _this._validateSampleRate((_b = _this._config.session_recording) === null || _b === void 0 ? void 0 : _b.sampleRate, 'session_recording.sampleRate');
                var remoteSampleRate = _this._validateSampleRate(sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.sampleRate, 'remote config sampleRate');
                var parsedSampleRate = localSampleRate !== null && localSampleRate !== void 0 ? localSampleRate : remoteSampleRate;
                if ((0, core_1.isNullish)(parsedSampleRate)) {
                    _this._resetSampling();
                }
                var receivedMinimumDuration = sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.minimumDurationMilliseconds;
                persistence_1.register((_a = {},
                    _a[constants_1.SESSION_RECORDING_REMOTE_CONFIG] = __assign(__assign({ cache_timestamp: Date.now(), enabled: !!sessionRecordingConfigResponse }, sessionRecordingConfigResponse), { networkPayloadCapture: __assign({ capturePerformance: response.capturePerformance }, sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.networkPayloadCapture), canvasRecording: {
                            enabled: sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.recordCanvas,
                            fps: sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.canvasFps,
                            quality: sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.canvasQuality,
                        }, sampleRate: parsedSampleRate, minimumDurationMilliseconds: (0, core_1.isUndefined)(receivedMinimumDuration)
                            ? null
                            : receivedMinimumDuration, endpoint: sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.endpoint, triggerMatchType: sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.triggerMatchType, masking: sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.masking, urlTriggers: sessionRecordingConfigResponse === null || sessionRecordingConfigResponse === void 0 ? void 0 : sessionRecordingConfigResponse.urlTriggers }),
                    _a));
            };
            persistResponse();
            // in case we see multiple flags responses, we should only use the response from the most recent one
            (_a = this._persistFlagsOnSessionListener) === null || _a === void 0 ? void 0 : _a.call(this);
            // we 100% know there is a session manager by this point
            this._persistFlagsOnSessionListener = (_b = this._instance.sessionManager) === null || _b === void 0 ? void 0 : _b.onSessionId(persistResponse);
        }
    };
    SessionRecording.prototype.onRemoteConfig = function (response) {
        if (!('sessionRecording' in response)) {
            if (this._recordingStatus === triggerMatching_1.AWAITING_CONFIG) {
                this._recordingStatus = triggerMatching_1.MISSING_CONFIG;
                logger.warn('config refresh failed, recording will not start until page reload');
            }
            this.startIfEnabledOrStop();
            return;
        }
        if (response.sessionRecording === false) {
            this._persistRemoteConfig(response);
            this._discardRecording();
            return;
        }
        this._persistRemoteConfig(response);
        this.startIfEnabledOrStop();
    };
    SessionRecording.prototype.log = function (message, level) {
        var _a;
        if (level === void 0) { level = 'log'; }
        if ((_a = this._lazyLoadedSessionRecording) === null || _a === void 0 ? void 0 : _a.log) {
            this._lazyLoadedSessionRecording.log(message, level);
        }
        else {
            logger.warn('log called before recorder was ready');
        }
    };
    Object.defineProperty(SessionRecording.prototype, "_scriptName", {
        get: function () {
            var _a, _b, _c;
            var remoteConfig = (_b = (_a = this._instance) === null || _a === void 0 ? void 0 : _a.persistence) === null || _b === void 0 ? void 0 : _b.get_property(constants_1.SESSION_RECORDING_REMOTE_CONFIG);
            return ((_c = remoteConfig === null || remoteConfig === void 0 ? void 0 : remoteConfig.scriptConfig) === null || _c === void 0 ? void 0 : _c.script) || 'lazy-recorder';
        },
        enumerable: false,
        configurable: true
    });
    SessionRecording.prototype._isRemoteConfigFresh = function () {
        var _a;
        var persistedConfig = this._instance.get_property(constants_1.SESSION_RECORDING_REMOTE_CONFIG);
        if (!persistedConfig) {
            return false;
        }
        var config = typeof persistedConfig === 'object' ? persistedConfig : JSON.parse(persistedConfig);
        // default to now so that configs persisted by older SDK versions
        // (which never set cache_timestamp) are treated as fresh
        var cacheTimestamp = (_a = config.cache_timestamp) !== null && _a !== void 0 ? _a : Date.now();
        return Date.now() - cacheTimestamp <= lazy_loaded_session_recorder_1.RECORDING_REMOTE_CONFIG_TTL_MS;
    };
    SessionRecording.prototype._onScriptLoaded = function (startReason) {
        var _a, _b;
        if (!((_a = globals_1.assignableWindow.__PosthogExtensions__) === null || _a === void 0 ? void 0 : _a.initSessionRecording)) {
            logger.warn('Called on script loaded before session recording is available. This can be caused by adblockers.');
            this._instance.register_for_session({
                $sdk_debug_recording_script_not_loaded: true,
            });
            return;
        }
        if (!this._lazyLoadedSessionRecording) {
            this._lazyLoadedSessionRecording = (_b = globals_1.assignableWindow.__PosthogExtensions__) === null || _b === void 0 ? void 0 : _b.initSessionRecording(this._instance);
            this._lazyLoadedSessionRecording._forceAllowLocalhostNetworkCapture =
                this._forceAllowLocalhostNetworkCapture;
        }
        if (!this._isRemoteConfigFresh()) {
            if (this._recordingStatus === triggerMatching_1.MISSING_CONFIG || this._recordingStatus === triggerMatching_1.AWAITING_CONFIG) {
                return;
            }
            this._recordingStatus = triggerMatching_1.AWAITING_CONFIG;
            logger.info('persisted remote config is stale, requesting fresh config before starting');
            new remote_config_1.RemoteConfigLoader(this._instance).load();
            return;
        }
        this._recordingStatus = triggerMatching_1.LAZY_LOADING;
        this._lazyLoadedSessionRecording.start(startReason);
    };
    /**
     * this is maintained on the public API only because it has always been on the public API
     * if you are calling this directly you are certainly doing something wrong
     * @deprecated
     */
    SessionRecording.prototype.onRRwebEmit = function (rawEvent) {
        var _a, _b;
        (_b = (_a = this._lazyLoadedSessionRecording) === null || _a === void 0 ? void 0 : _a.onRRwebEmit) === null || _b === void 0 ? void 0 : _b.call(_a, rawEvent);
    };
    /**
     * this ignores the linked flag config and (if other conditions are met) causes capture to start
     *
     * It is not usual to call this directly,
     * instead call `posthog.startSessionRecording({linked_flag: true})`
     * */
    SessionRecording.prototype.overrideLinkedFlag = function () {
        var _a;
        var _b, _c;
        if (!this._lazyLoadedSessionRecording) {
            (_b = this._persistence) === null || _b === void 0 ? void 0 : _b.register((_a = {},
                _a[constants_1.SESSION_RECORDING_OVERRIDE_LINKED_FLAG] = true,
                _a));
        }
        (_c = this._lazyLoadedSessionRecording) === null || _c === void 0 ? void 0 : _c.overrideLinkedFlag();
    };
    /**
     * this ignores the sampling config and (if other conditions are met) causes capture to start
     *
     * It is not usual to call this directly,
     * instead call `posthog.startSessionRecording({sampling: true})`
     * */
    SessionRecording.prototype.overrideSampling = function () {
        var _a;
        var _b, _c;
        if (!this._lazyLoadedSessionRecording) {
            (_b = this._persistence) === null || _b === void 0 ? void 0 : _b.register((_a = {},
                _a[constants_1.SESSION_RECORDING_OVERRIDE_SAMPLING] = true,
                _a));
        }
        (_c = this._lazyLoadedSessionRecording) === null || _c === void 0 ? void 0 : _c.overrideSampling();
    };
    /**
     * this ignores the URL/Event trigger config and (if other conditions are met) causes capture to start
     *
     * It is not usual to call this directly,
     * instead call `posthog.startSessionRecording({trigger: 'url' | 'event'})`
     * */
    SessionRecording.prototype.overrideTrigger = function (triggerType) {
        var _a;
        var _b, _c;
        if (!this._lazyLoadedSessionRecording) {
            (_b = this._persistence) === null || _b === void 0 ? void 0 : _b.register((_a = {},
                _a[triggerType === 'url'
                    ? constants_1.SESSION_RECORDING_OVERRIDE_URL_TRIGGER
                    : constants_1.SESSION_RECORDING_OVERRIDE_EVENT_TRIGGER] = true,
                _a));
        }
        (_c = this._lazyLoadedSessionRecording) === null || _c === void 0 ? void 0 : _c.overrideTrigger(triggerType);
    };
    Object.defineProperty(SessionRecording.prototype, "sdkDebugProperties", {
        /*
         * whenever we capture an event, we add these properties to the event
         * these are used to debug issues with the session recording
         * when looking at the event feed for a session
         */
        get: function () {
            var _a;
            return (((_a = this._lazyLoadedSessionRecording) === null || _a === void 0 ? void 0 : _a.sdkDebugProperties) || {
                $recording_status: this.status,
            });
        },
        enumerable: false,
        configurable: true
    });
    /**
     * This adds a custom event to the session recording
     *
     * It is not intended for arbitrary public use - playback only displays known custom events
     * And is exposed on the public interface only so that other parts of the SDK are able to use it
     *
     * if you are calling this from client code, you're probably looking for `posthog.capture('$custom_event', {...})`
     */
    SessionRecording.prototype.tryAddCustomEvent = function (tag, payload) {
        var _a;
        return !!((_a = this._lazyLoadedSessionRecording) === null || _a === void 0 ? void 0 : _a.tryAddCustomEvent(tag, payload));
    };
    return SessionRecording;
}());
exports.SessionRecording = SessionRecording;
//# sourceMappingURL=session-recording.js.map