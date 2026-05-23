"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteConfigLoader = void 0;
var logger_1 = require("./utils/logger");
var globals_1 = require("./utils/globals");
var logger = (0, logger_1.createLogger)('[RemoteConfig]');
// Default refresh interval for feature flags in long-running sessions.
// 5 minutes balances freshness with server load - flags typically don't change
// frequently, and most sessions are shorter than this anyway.
var DEFAULT_REFRESH_INTERVAL = 5 * 60 * 1000;
var RemoteConfigLoader = /** @class */ (function () {
    function RemoteConfigLoader(_instance) {
        this._instance = _instance;
    }
    Object.defineProperty(RemoteConfigLoader.prototype, "remoteConfig", {
        get: function () {
            var _a, _b;
            return (_b = (_a = globals_1.assignableWindow._POSTHOG_REMOTE_CONFIG) === null || _a === void 0 ? void 0 : _a[this._instance.config.token]) === null || _b === void 0 ? void 0 : _b.config;
        },
        enumerable: false,
        configurable: true
    });
    RemoteConfigLoader.prototype._loadRemoteConfigJs = function (cb) {
        var _this = this;
        var _a, _b, _c;
        if ((_a = globals_1.assignableWindow.__PosthogExtensions__) === null || _a === void 0 ? void 0 : _a.loadExternalDependency) {
            (_c = (_b = globals_1.assignableWindow.__PosthogExtensions__) === null || _b === void 0 ? void 0 : _b.loadExternalDependency) === null || _c === void 0 ? void 0 : _c.call(_b, this._instance, 'remote-config', function () {
                return cb(_this.remoteConfig);
            });
        }
        else {
            cb();
        }
    };
    RemoteConfigLoader.prototype._loadRemoteConfigJSON = function (cb) {
        this._instance._send_request({
            method: 'GET',
            url: this._instance.requestRouter.endpointFor('assets', "/array/".concat(this._instance.config.token, "/config")),
            callback: function (response) {
                cb(response.json);
            },
        });
    };
    RemoteConfigLoader.prototype.load = function () {
        var _this = this;
        try {
            // Attempt 1 - use the pre-loaded config if it came as part of the token-specific array.js
            if (this.remoteConfig) {
                logger.info('Using preloaded remote config', this.remoteConfig);
                this._onRemoteConfig(this.remoteConfig);
                this._startRefreshInterval();
                return;
            }
            if (this._instance._shouldDisableFlags()) {
                // This setting is essentially saying "dont call external APIs" hence we respect it here
                logger.warn('Remote config is disabled. Falling back to local config.');
                return;
            }
            // Attempt 2 - if we have the external deps loader then lets load the script version of the config that includes site apps
            this._loadRemoteConfigJs(function (config) {
                if (!config) {
                    logger.info('No config found after loading remote JS config. Falling back to JSON.');
                    // Attempt 3 Load the config json instead of the script - we won't get site apps etc. but we will get the config
                    _this._loadRemoteConfigJSON(function (config) {
                        _this._onRemoteConfig(config);
                        _this._startRefreshInterval();
                    });
                    return;
                }
                _this._onRemoteConfig(config);
                _this._startRefreshInterval();
            });
        }
        catch (error) {
            logger.error('Error loading remote config', error);
        }
    };
    RemoteConfigLoader.prototype.stop = function () {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = undefined;
        }
    };
    /**
     * Refresh feature flags for long-running sessions.
     * Calls reloadFeatureFlags() directly rather than re-fetching config — the initial
     * config load already determined whether flags are enabled, and reloadFeatureFlags()
     * is a no-op when flags are disabled. This avoids an unnecessary network round-trip.
     */
    RemoteConfigLoader.prototype.refresh = function () {
        if (this._instance._shouldDisableFlags() || (globals_1.document === null || globals_1.document === void 0 ? void 0 : globals_1.document.visibilityState) === 'hidden') {
            return;
        }
        this._instance.reloadFeatureFlags();
    };
    RemoteConfigLoader.prototype._startRefreshInterval = function () {
        var _this = this;
        var _a;
        if (this._refreshInterval) {
            return;
        }
        var intervalMs = (_a = this._instance.config.remote_config_refresh_interval_ms) !== null && _a !== void 0 ? _a : DEFAULT_REFRESH_INTERVAL;
        // Allow users to disable periodic refresh by setting interval to 0
        if (intervalMs === 0) {
            return;
        }
        this._refreshInterval = setInterval(function () {
            _this.refresh();
        }, intervalMs);
    };
    RemoteConfigLoader.prototype._onRemoteConfig = function (config) {
        var _a;
        if (!config) {
            logger.error('Failed to fetch remote config from PostHog.');
        }
        // Config and flags are loaded separately: config from /array/{token}/config,
        // flags from /flags/?v=2. Features like surveys, session recording, and product
        // tours reference flags in their config (e.g. survey.linked_flag_key), but this
        // is safe because those flag checks happen lazily at runtime (e.g. when deciding
        // whether to show a survey), not during config processing. By the time a linked
        // flag is evaluated, flags have already loaded.
        //
        // Even when config fails, we pass an empty object so extensions (autocapture,
        // session recording, etc.) still initialize with their defaults.
        this._instance._onRemoteConfig(config !== null && config !== void 0 ? config : {});
        if ((config === null || config === void 0 ? void 0 : config.hasFeatureFlags) !== false) {
            if (!this._instance.config.advanced_disable_feature_flags_on_first_load) {
                (_a = this._instance.featureFlags) === null || _a === void 0 ? void 0 : _a.ensureFlagsLoaded();
            }
        }
    };
    return RemoteConfigLoader;
}());
exports.RemoteConfigLoader = RemoteConfigLoader;
//# sourceMappingURL=remote-config.js.map