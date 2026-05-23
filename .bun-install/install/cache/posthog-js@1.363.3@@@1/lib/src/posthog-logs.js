"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostHogLogs = void 0;
var constants_1 = require("./constants");
var core_1 = require("@posthog/core");
var globals_1 = require("./utils/globals");
var logger_1 = require("./utils/logger");
var PostHogLogs = /** @class */ (function () {
    function PostHogLogs(_instance) {
        var _a;
        this._instance = _instance;
        this._isLogsEnabled = false;
        this._isLoaded = false;
        if (this._instance && ((_a = this._instance.config.logs) === null || _a === void 0 ? void 0 : _a.captureConsoleLogs)) {
            this._isLogsEnabled = true;
        }
    }
    PostHogLogs.prototype.initialize = function () {
        this.loadIfEnabled();
    };
    PostHogLogs.prototype.onRemoteConfig = function (response) {
        var _a;
        // only load logs if they are enabled
        var logCapture = (_a = response.logs) === null || _a === void 0 ? void 0 : _a.captureConsoleLogs;
        if ((0, core_1.isNullish)(logCapture) || !logCapture) {
            return;
        }
        this._isLogsEnabled = true;
        this.loadIfEnabled();
    };
    PostHogLogs.prototype.reset = function () { };
    PostHogLogs.prototype.loadIfEnabled = function () {
        var _this = this;
        if (!this._isLogsEnabled || this._isLoaded) {
            return;
        }
        var logger = (0, logger_1.createLogger)('[logs]');
        var phExtensions = globals_1.assignableWindow === null || globals_1.assignableWindow === void 0 ? void 0 : globals_1.assignableWindow.__PosthogExtensions__;
        if (!phExtensions) {
            logger.error('PostHog Extensions not found.');
            return;
        }
        var loadExternalDependency = phExtensions.loadExternalDependency;
        if (!loadExternalDependency) {
            logger.error(constants_1.LOAD_EXT_NOT_FOUND);
            return;
        }
        loadExternalDependency(this._instance, 'logs', function (err) {
            var _a;
            if (err || !((_a = phExtensions.logs) === null || _a === void 0 ? void 0 : _a.initializeLogs)) {
                logger.error('Could not load logs script', err);
            }
            else {
                phExtensions.logs.initializeLogs(_this._instance);
                _this._isLoaded = true;
            }
        });
    };
    return PostHogLogs;
}());
exports.PostHogLogs = PostHogLogs;
//# sourceMappingURL=posthog-logs.js.map