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
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebVitalsAutocapture = exports.FIFTEEN_MINUTES_IN_MILLIS = exports.DEFAULT_FLUSH_TO_CAPTURE_TIMEOUT_MILLISECONDS = void 0;
var logger_1 = require("../../utils/logger");
var core_1 = require("@posthog/core");
var constants_1 = require("../../constants");
var globals_1 = require("../../utils/globals");
var request_utils_1 = require("../../utils/request-utils");
var event_utils_1 = require("../../utils/event-utils");
var logger = (0, logger_1.createLogger)('[Web Vitals]');
exports.DEFAULT_FLUSH_TO_CAPTURE_TIMEOUT_MILLISECONDS = 5000;
var ONE_MINUTE_IN_MILLIS = 60 * 1000;
exports.FIFTEEN_MINUTES_IN_MILLIS = 15 * ONE_MINUTE_IN_MILLIS;
var WebVitalsAutocapture = /** @class */ (function () {
    function WebVitalsAutocapture(_instance) {
        var _this = this;
        var _a;
        this._instance = _instance;
        this._enabledServerSide = false;
        this._initialized = false;
        this._buffer = { url: undefined, metrics: [], firstMetricTimestamp: undefined };
        this._flushToCapture = function () {
            clearTimeout(_this._delayedFlushTimer);
            if (_this._buffer.metrics.length === 0) {
                return;
            }
            _this._instance.capture('$web_vitals', _this._buffer.metrics.reduce(function (acc, metric) {
                var _a;
                return (__assign(__assign({}, acc), (_a = {}, _a["$web_vitals_".concat(metric.name, "_event")] = __assign({}, metric), _a["$web_vitals_".concat(metric.name, "_value")] = metric.value, _a)));
            }, {}));
            _this._buffer = { url: undefined, metrics: [], firstMetricTimestamp: undefined };
        };
        this._addToBuffer = function (metric) {
            var _a;
            var sessionIds = (_a = _this._instance.sessionManager) === null || _a === void 0 ? void 0 : _a.checkAndGetSessionAndWindowId(true);
            if ((0, core_1.isUndefined)(sessionIds)) {
                logger.error('Could not read session ID. Dropping metrics!');
                return;
            }
            _this._buffer = _this._buffer || { url: undefined, metrics: [], firstMetricTimestamp: undefined };
            var $currentUrl = _this._currentURL();
            if ((0, core_1.isUndefined)($currentUrl)) {
                return;
            }
            if ((0, core_1.isNullish)(metric === null || metric === void 0 ? void 0 : metric.name) || (0, core_1.isNullish)(metric === null || metric === void 0 ? void 0 : metric.value)) {
                logger.error('Invalid metric received', metric);
                return;
            }
            // we observe some very large values sometimes, we'll ignore them
            // since the likelihood of LCP > 1 hour being correct is very low
            if (_this._maxAllowedValue && metric.value >= _this._maxAllowedValue) {
                logger.error('Ignoring metric with value >= ' + _this._maxAllowedValue, metric);
                return;
            }
            var urlHasChanged = _this._buffer.url !== $currentUrl;
            if (urlHasChanged) {
                // we need to send what we have
                _this._flushToCapture();
                // poor performance is >4s, we wait twice that time to send
                // this is in case we haven't received all metrics
                // we'll at least gather some
                _this._delayedFlushTimer = setTimeout(_this._flushToCapture, _this.flushToCaptureTimeoutMs);
            }
            if ((0, core_1.isUndefined)(_this._buffer.url)) {
                _this._buffer.url = $currentUrl;
            }
            _this._buffer.firstMetricTimestamp = (0, core_1.isUndefined)(_this._buffer.firstMetricTimestamp)
                ? Date.now()
                : _this._buffer.firstMetricTimestamp;
            if (metric.attribution && metric.attribution.interactionTargetElement) {
                // we don't want to send the entire element
                // they can be very large
                // TODO we could run this through autocapture code so that we get elements chain info
                //  and can display the element in the UI
                metric.attribution.interactionTargetElement = undefined;
            }
            _this._buffer.metrics.push(__assign(__assign({}, metric), { $current_url: $currentUrl, $session_id: sessionIds.sessionId, $window_id: sessionIds.windowId, timestamp: Date.now() }));
            if (_this._buffer.metrics.length === _this.allowedMetrics.length) {
                // we have all allowed metrics
                _this._flushToCapture();
            }
        };
        this._startCapturing = function () {
            var _a;
            // IMPORTANT: web-vitals does not provide cleanup functions and warns against
            // calling functions more than once per page load. Each call creates new
            // PerformanceObservers that persist for the page lifetime.
            // See: https://github.com/GoogleChrome/web-vitals/issues/629
            if (_this._initialized) {
                return;
            }
            var onLCP;
            var onCLS;
            var onFCP;
            var onINP;
            var posthogExtensions = globals_1.assignableWindow.__PosthogExtensions__;
            if (!(0, core_1.isUndefined)(posthogExtensions) && !(0, core_1.isUndefined)(posthogExtensions.postHogWebVitalsCallbacks)) {
                ;
                (_a = posthogExtensions.postHogWebVitalsCallbacks, onLCP = _a.onLCP, onCLS = _a.onCLS, onFCP = _a.onFCP, onINP = _a.onINP);
            }
            if (!onLCP || !onCLS || !onFCP || !onINP) {
                logger.error('web vitals callbacks not loaded - not starting');
                return;
            }
            // register performance observers
            if (_this.allowedMetrics.indexOf('LCP') > -1) {
                onLCP(_this._addToBuffer.bind(_this));
            }
            if (_this.allowedMetrics.indexOf('CLS') > -1) {
                onCLS(_this._addToBuffer.bind(_this));
            }
            if (_this.allowedMetrics.indexOf('FCP') > -1) {
                onFCP(_this._addToBuffer.bind(_this));
            }
            if (_this.allowedMetrics.indexOf('INP') > -1) {
                onINP(_this._addToBuffer.bind(_this));
            }
            _this._initialized = true;
        };
        this._enabledServerSide = !!((_a = this._instance.persistence) === null || _a === void 0 ? void 0 : _a.props[constants_1.WEB_VITALS_ENABLED_SERVER_SIDE]);
        this.startIfEnabled();
    }
    Object.defineProperty(WebVitalsAutocapture.prototype, "_perfConfig", {
        /** Shorthand for performance config to reduce bundle size */
        get: function () {
            return this._instance.config.capture_performance;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WebVitalsAutocapture.prototype, "allowedMetrics", {
        get: function () {
            var _a, _b;
            var clientConfigMetricAllowList = (0, core_1.isObject)(this._perfConfig)
                ? (_a = this._perfConfig) === null || _a === void 0 ? void 0 : _a.web_vitals_allowed_metrics
                : undefined;
            return !(0, core_1.isNullish)(clientConfigMetricAllowList)
                ? clientConfigMetricAllowList
                : ((_b = this._instance.persistence) === null || _b === void 0 ? void 0 : _b.props[constants_1.WEB_VITALS_ALLOWED_METRICS]) || ['CLS', 'FCP', 'INP', 'LCP'];
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WebVitalsAutocapture.prototype, "flushToCaptureTimeoutMs", {
        get: function () {
            var clientConfig = (0, core_1.isObject)(this._perfConfig)
                ? this._perfConfig.web_vitals_delayed_flush_ms
                : undefined;
            return clientConfig || exports.DEFAULT_FLUSH_TO_CAPTURE_TIMEOUT_MILLISECONDS;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WebVitalsAutocapture.prototype, "useAttribution", {
        get: function () {
            var clientConfig = (0, core_1.isObject)(this._perfConfig)
                ? this._perfConfig.web_vitals_attribution
                : undefined;
            return clientConfig !== null && clientConfig !== void 0 ? clientConfig : false;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WebVitalsAutocapture.prototype, "_maxAllowedValue", {
        get: function () {
            var configured = (0, core_1.isObject)(this._perfConfig) && (0, core_1.isNumber)(this._perfConfig.__web_vitals_max_value)
                ? this._perfConfig.__web_vitals_max_value
                : exports.FIFTEEN_MINUTES_IN_MILLIS;
            // you can set to 0 to disable the check or any value over ten seconds
            // 1 milli to 1 minute will be set to 15 minutes, cos that would be a silly low maximum
            return 0 < configured && configured <= ONE_MINUTE_IN_MILLIS ? exports.FIFTEEN_MINUTES_IN_MILLIS : configured;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(WebVitalsAutocapture.prototype, "isEnabled", {
        get: function () {
            // Always disable web vitals if we're not on http or https
            var protocol = globals_1.location === null || globals_1.location === void 0 ? void 0 : globals_1.location.protocol;
            if (protocol !== 'http:' && protocol !== 'https:') {
                logger.info('Web Vitals are disabled on non-http/https protocols');
                return false;
            }
            // Otherwise, check config
            var clientConfig = (0, core_1.isObject)(this._perfConfig)
                ? this._perfConfig.web_vitals
                : (0, core_1.isBoolean)(this._perfConfig)
                    ? this._perfConfig
                    : undefined;
            return (0, core_1.isBoolean)(clientConfig) ? clientConfig : this._enabledServerSide;
        },
        enumerable: false,
        configurable: true
    });
    WebVitalsAutocapture.prototype.startIfEnabled = function () {
        if (this.isEnabled && !this._initialized) {
            logger.info('enabled, starting...');
            this._loadScript(this._startCapturing);
        }
    };
    WebVitalsAutocapture.prototype.onRemoteConfig = function (response) {
        var _a, _b;
        if (!('capturePerformance' in response)) {
            return;
        }
        var webVitalsOptIn = (0, core_1.isObject)(response.capturePerformance) && !!response.capturePerformance.web_vitals;
        var allowedMetrics = (0, core_1.isObject)(response.capturePerformance)
            ? response.capturePerformance.web_vitals_allowed_metrics
            : undefined;
        if (this._instance.persistence) {
            this._instance.persistence.register((_a = {},
                _a[constants_1.WEB_VITALS_ENABLED_SERVER_SIDE] = webVitalsOptIn,
                _a));
            this._instance.persistence.register((_b = {},
                _b[constants_1.WEB_VITALS_ALLOWED_METRICS] = allowedMetrics,
                _b));
        }
        // store this in-memory in case persistence is disabled
        this._enabledServerSide = webVitalsOptIn;
        this.startIfEnabled();
    };
    WebVitalsAutocapture.prototype._loadScript = function (cb) {
        var _a, _b, _c;
        if ((_a = globals_1.assignableWindow.__PosthogExtensions__) === null || _a === void 0 ? void 0 : _a.postHogWebVitalsCallbacks) {
            // already loaded
            cb();
            return;
        }
        var kind = this.useAttribution ? 'web-vitals-with-attribution' : 'web-vitals';
        (_c = (_b = globals_1.assignableWindow.__PosthogExtensions__) === null || _b === void 0 ? void 0 : _b.loadExternalDependency) === null || _c === void 0 ? void 0 : _c.call(_b, this._instance, kind, function (err) {
            if (err) {
                logger.error('failed to load script', err);
                return;
            }
            cb();
        });
    };
    WebVitalsAutocapture.prototype._currentURL = function () {
        var href = globals_1.window ? globals_1.window.location.href : undefined;
        if (!href) {
            logger.error('Could not determine current URL');
            return undefined;
        }
        // mask url query params
        var maskPersonalDataProperties = this._instance.config.mask_personal_data_properties;
        var customPersonalDataProperties = this._instance.config.custom_personal_data_properties;
        var paramsToMask = maskPersonalDataProperties
            ? __spreadArray(__spreadArray([], __read(event_utils_1.PERSONAL_DATA_CAMPAIGN_PARAMS), false), __read((customPersonalDataProperties || [])), false) : [];
        return (0, request_utils_1.maskQueryParams)(href, paramsToMask, event_utils_1.MASKED);
    };
    return WebVitalsAutocapture;
}());
exports.WebVitalsAutocapture = WebVitalsAutocapture;
//# sourceMappingURL=index.js.map