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
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
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
exports.PostHogFeatureFlags = exports.QuotaLimitedResource = exports.parseFlagsResponse = exports.filterActiveFeatureFlags = exports.FeatureFlagError = void 0;
var utils_1 = require("./utils");
var types_1 = require("./types");
var constants_1 = require("./constants");
var core_1 = require("@posthog/core");
var logger_1 = require("./utils/logger");
var event_utils_1 = require("./utils/event-utils");
var logger = (0, logger_1.createLogger)('[FeatureFlags]');
var forceDebugLogger = (0, logger_1.createLogger)('[FeatureFlags]', { debugEnabled: true });
var FLAG_TIMEOUT_MSG = '" failed. Feature flags didn\'t load in time.';
/**
 * Error type constants for the $feature_flag_error property.
 *
 * These values are sent in analytics events to track flag evaluation failures.
 * They should not be changed without considering impact on existing dashboards
 * and queries that filter on these values.
 */
exports.FeatureFlagError = {
    ERRORS_WHILE_COMPUTING: 'errors_while_computing_flags',
    FLAG_MISSING: 'flag_missing',
    QUOTA_LIMITED: 'quota_limited',
    TIMEOUT: 'timeout',
    CONNECTION_ERROR: 'connection_error',
    UNKNOWN_ERROR: 'unknown_error',
    apiError: function (status) { return "api_error_".concat(status); },
};
var PERSISTENCE_ACTIVE_FEATURE_FLAGS = '$active_feature_flags';
var PERSISTENCE_OVERRIDE_FEATURE_FLAGS = '$override_feature_flags';
var PERSISTENCE_FEATURE_FLAG_PAYLOADS = '$feature_flag_payloads';
var PERSISTENCE_OVERRIDE_FEATURE_FLAG_PAYLOADS = '$override_feature_flag_payloads';
var PERSISTENCE_FEATURE_FLAG_REQUEST_ID = '$feature_flag_request_id';
/** Converts an array of flag names to a Record where each flag is set to true. */
var arrayToFlagsRecord = function (flags) {
    var flagsObj = {};
    for (var i = 0; i < flags.length; i++) {
        flagsObj[flags[i]] = true;
    }
    return flagsObj;
};
var filterActiveFeatureFlags = function (featureFlags) {
    var e_1, _a;
    var activeFeatureFlags = {};
    try {
        for (var _b = __values((0, utils_1.entries)(featureFlags || {})), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), key = _d[0], value = _d[1];
            if (value) {
                activeFeatureFlags[key] = value;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return activeFeatureFlags;
};
exports.filterActiveFeatureFlags = filterActiveFeatureFlags;
var parseFlagsResponse = function (response, persistence, currentFlags, currentFlagPayloads, currentFlagDetails) {
    var _a, _b, _c, _d;
    if (currentFlags === void 0) { currentFlags = {}; }
    if (currentFlagPayloads === void 0) { currentFlagPayloads = {}; }
    if (currentFlagDetails === void 0) { currentFlagDetails = {}; }
    var normalizedResponse = normalizeFlagsResponse(response);
    var flagDetails = normalizedResponse.flags;
    var featureFlags = normalizedResponse.featureFlags;
    var flagPayloads = normalizedResponse.featureFlagPayloads;
    if (!featureFlags) {
        return; // <-- This early return means we don't update anything, which is good.
    }
    var requestId = response['requestId'];
    var evaluatedAt = response['evaluatedAt'];
    // using the v1 api
    if ((0, core_1.isArray)(featureFlags)) {
        logger.warn('v1 of the feature flags endpoint is deprecated. Please use the latest version.');
        var $enabled_feature_flags = {};
        if (featureFlags) {
            for (var i = 0; i < featureFlags.length; i++) {
                $enabled_feature_flags[featureFlags[i]] = true;
            }
        }
        persistence &&
            persistence.register((_a = {},
                _a[PERSISTENCE_ACTIVE_FEATURE_FLAGS] = featureFlags,
                _a[constants_1.ENABLED_FEATURE_FLAGS] = $enabled_feature_flags,
                _a));
        return;
    }
    // using the v2+ api
    var newFeatureFlags = featureFlags;
    var newFeatureFlagPayloads = flagPayloads;
    var newFeatureFlagDetails = flagDetails;
    if (response.errorsWhileComputingFlags) {
        // if not all flags were computed, we upsert flags instead of replacing them
        // but filter out flags that failed to evaluate so they don't overwrite cached values
        if (flagDetails) {
            var successfulKeys_1 = new Set(Object.keys(flagDetails).filter(function (key) { var _a; return !((_a = flagDetails[key]) === null || _a === void 0 ? void 0 : _a.failed); }));
            newFeatureFlags = __assign(__assign({}, currentFlags), Object.fromEntries(Object.entries(newFeatureFlags).filter(function (_a) {
                var _b = __read(_a, 1), key = _b[0];
                return successfulKeys_1.has(key);
            })));
            newFeatureFlagPayloads = __assign(__assign({}, currentFlagPayloads), Object.fromEntries(Object.entries(newFeatureFlagPayloads || {}).filter(function (_a) {
                var _b = __read(_a, 1), key = _b[0];
                return successfulKeys_1.has(key);
            })));
            newFeatureFlagDetails = __assign(__assign({}, currentFlagDetails), Object.fromEntries(Object.entries(newFeatureFlagDetails || {}).filter(function (_a) {
                var _b = __read(_a, 1), key = _b[0];
                return successfulKeys_1.has(key);
            })));
        }
        else {
            // v1 responses don't have flagDetails, so we can't filter by failed field
            // Fall back to the original merge behavior
            newFeatureFlags = __assign(__assign({}, currentFlags), newFeatureFlags);
            newFeatureFlagPayloads = __assign(__assign({}, currentFlagPayloads), newFeatureFlagPayloads);
            newFeatureFlagDetails = __assign(__assign({}, currentFlagDetails), newFeatureFlagDetails);
        }
    }
    persistence &&
        persistence.register(__assign(__assign((_b = {}, _b[PERSISTENCE_ACTIVE_FEATURE_FLAGS] = Object.keys((0, exports.filterActiveFeatureFlags)(newFeatureFlags)), _b[constants_1.ENABLED_FEATURE_FLAGS] = newFeatureFlags || {}, _b[PERSISTENCE_FEATURE_FLAG_PAYLOADS] = newFeatureFlagPayloads || {}, _b[constants_1.PERSISTENCE_FEATURE_FLAG_DETAILS] = newFeatureFlagDetails || {}, _b), (requestId ? (_c = {}, _c[PERSISTENCE_FEATURE_FLAG_REQUEST_ID] = requestId, _c) : {})), (evaluatedAt ? (_d = {}, _d[constants_1.PERSISTENCE_FEATURE_FLAG_EVALUATED_AT] = evaluatedAt, _d) : {})));
};
exports.parseFlagsResponse = parseFlagsResponse;
var normalizeFlagsResponse = function (response) {
    var flagDetails = response['flags'];
    if (flagDetails) {
        // This is a /flags?v=2 request.
        // Map of flag keys to flag values: Record<string, string | boolean>
        response.featureFlags = Object.fromEntries(Object.keys(flagDetails).map(function (flag) { var _a; return [flag, (_a = flagDetails[flag].variant) !== null && _a !== void 0 ? _a : flagDetails[flag].enabled]; }));
        // Map of flag keys to flag payloads: Record<string, JsonType>
        response.featureFlagPayloads = Object.fromEntries(Object.keys(flagDetails)
            .filter(function (flag) { return flagDetails[flag].enabled; })
            .filter(function (flag) { var _a; return (_a = flagDetails[flag].metadata) === null || _a === void 0 ? void 0 : _a.payload; })
            .map(function (flag) { var _a; return [flag, (_a = flagDetails[flag].metadata) === null || _a === void 0 ? void 0 : _a.payload]; }));
    }
    else {
        logger.warn('Using an older version of the feature flags endpoint. Please upgrade your PostHog server to the latest version');
    }
    return response;
};
exports.QuotaLimitedResource = {
    FeatureFlags: 'feature_flags',
    Recordings: 'recordings',
};
var PostHogFeatureFlags = /** @class */ (function () {
    function PostHogFeatureFlags(_instance) {
        this._instance = _instance;
        this._override_warning = false;
        this._hasLoadedFlags = false;
        this._requestInFlight = false;
        this._reloadingDisabled = false;
        this._additionalReloadRequested = false;
        this._flagsLoadedFromRemote = false;
        this._hasLoggedDeprecationWarning = false;
        this._staleCacheRefreshTriggered = false;
        this.featureFlagEventHandlers = [];
    }
    Object.defineProperty(PostHogFeatureFlags.prototype, "_config", {
        get: function () {
            return this._instance.config;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(PostHogFeatureFlags.prototype, "_persistence", {
        get: function () {
            return this._instance.persistence;
        },
        enumerable: false,
        configurable: true
    });
    PostHogFeatureFlags.prototype._prop = function (key) {
        return this._instance.get_property(key);
    };
    /**
     * Check if the feature flag cache is stale based on the configured TTL.
     */
    PostHogFeatureFlags.prototype._isCacheStale = function () {
        var _a, _b;
        return (_b = (_a = this._persistence) === null || _a === void 0 ? void 0 : _a._isFeatureFlagCacheStale(this._config.feature_flag_cache_ttl_ms)) !== null && _b !== void 0 ? _b : false;
    };
    /**
     * Triggers a debounced reload when cache staleness is first detected.
     * Returns true if cache is stale, false otherwise.
     */
    PostHogFeatureFlags.prototype._checkAndTriggerStaleRefresh = function () {
        if (!this._isCacheStale()) {
            return false;
        }
        // Only trigger refresh once per stale period
        if (!this._staleCacheRefreshTriggered && !this._requestInFlight) {
            this._staleCacheRefreshTriggered = true;
            logger.warn('Feature flag cache is stale, triggering refresh...');
            this.reloadFeatureFlags();
        }
        return true;
    };
    PostHogFeatureFlags.prototype._getValidEvaluationEnvironments = function () {
        var _a;
        // Support both evaluation_contexts (new) and evaluation_environments (deprecated)
        var envs = (_a = this._config.evaluation_contexts) !== null && _a !== void 0 ? _a : this._config.evaluation_environments;
        // Log deprecation warning if using old field (only once)
        if (this._config.evaluation_environments &&
            !this._config.evaluation_contexts &&
            !this._hasLoggedDeprecationWarning) {
            logger.warn('evaluation_environments is deprecated. Use evaluation_contexts instead. evaluation_environments will be removed in a future version.');
            this._hasLoggedDeprecationWarning = true;
        }
        if (!(envs === null || envs === void 0 ? void 0 : envs.length)) {
            return [];
        }
        return envs.filter(function (env) {
            var isValid = env && typeof env === 'string' && env.trim().length > 0;
            if (!isValid) {
                logger.error('Invalid evaluation context found:', env, 'Expected non-empty string');
            }
            return isValid;
        });
    };
    PostHogFeatureFlags.prototype._shouldIncludeEvaluationEnvironments = function () {
        return this._getValidEvaluationEnvironments().length > 0;
    };
    PostHogFeatureFlags.prototype.initialize = function () {
        var _a, _b, _c, _d;
        var config = this._instance.config;
        var bootstrapFlags = (_b = (_a = config.bootstrap) === null || _a === void 0 ? void 0 : _a.featureFlags) !== null && _b !== void 0 ? _b : {};
        var hasBootstrappedFlags = Object.keys(bootstrapFlags).length;
        if (hasBootstrappedFlags) {
            var bootstrapPayloads_1 = (_d = (_c = config.bootstrap) === null || _c === void 0 ? void 0 : _c.featureFlagPayloads) !== null && _d !== void 0 ? _d : {};
            var activeFlags_1 = Object.keys(bootstrapFlags)
                .filter(function (flag) { return !!bootstrapFlags[flag]; })
                .reduce(function (res, key) {
                res[key] = bootstrapFlags[key] || false;
                return res;
            }, {});
            var featureFlagPayloads = Object.keys(bootstrapPayloads_1)
                .filter(function (key) { return activeFlags_1[key]; })
                .reduce(function (res, key) {
                if (bootstrapPayloads_1[key]) {
                    res[key] = bootstrapPayloads_1[key];
                }
                return res;
            }, {});
            this.receivedFeatureFlags({ featureFlags: activeFlags_1, featureFlagPayloads: featureFlagPayloads });
        }
    };
    PostHogFeatureFlags.prototype.updateFlags = function (flags, payloads, options) {
        var e_2, _a;
        // If merging, combine with existing flags
        var existingFlags = (options === null || options === void 0 ? void 0 : options.merge) ? this.getFlagVariants() : {};
        var existingPayloads = (options === null || options === void 0 ? void 0 : options.merge) ? this.getFlagPayloads() : {};
        var finalFlags = __assign(__assign({}, existingFlags), flags);
        var finalPayloads = __assign(__assign({}, existingPayloads), payloads);
        // Convert simple flags to v4 format to avoid deprecation warning
        var flagDetails = {};
        try {
            for (var _b = __values(Object.entries(finalFlags)), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), key = _d[0], value = _d[1];
                var isVariant = typeof value === 'string';
                flagDetails[key] = {
                    key: key,
                    enabled: isVariant ? true : Boolean(value),
                    variant: isVariant ? value : undefined,
                    reason: undefined,
                    // id: 0 indicates manually injected flags (not from server evaluation)
                    metadata: !(0, core_1.isUndefined)(finalPayloads === null || finalPayloads === void 0 ? void 0 : finalPayloads[key])
                        ? { id: 0, version: undefined, description: undefined, payload: finalPayloads[key] }
                        : undefined,
                };
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_2) throw e_2.error; }
        }
        this.receivedFeatureFlags({
            flags: flagDetails,
        });
    };
    Object.defineProperty(PostHogFeatureFlags.prototype, "hasLoadedFlags", {
        get: function () {
            return this._hasLoadedFlags;
        },
        enumerable: false,
        configurable: true
    });
    PostHogFeatureFlags.prototype.getFlags = function () {
        return Object.keys(this.getFlagVariants());
    };
    PostHogFeatureFlags.prototype.getFlagsWithDetails = function () {
        var e_3, _a;
        var _b, _c;
        var flagDetails = this._prop(constants_1.PERSISTENCE_FEATURE_FLAG_DETAILS);
        var overridenFlags = this._prop(PERSISTENCE_OVERRIDE_FEATURE_FLAGS);
        var overriddenPayloads = this._prop(PERSISTENCE_OVERRIDE_FEATURE_FLAG_PAYLOADS);
        if (!overriddenPayloads && !overridenFlags) {
            return flagDetails || {};
        }
        var finalDetails = (0, utils_1.extend)({}, flagDetails || {});
        var overriddenKeys = __spreadArray([], __read(new Set(__spreadArray(__spreadArray([], __read(Object.keys(overriddenPayloads || {})), false), __read(Object.keys(overridenFlags || {})), false))), false);
        try {
            for (var overriddenKeys_1 = __values(overriddenKeys), overriddenKeys_1_1 = overriddenKeys_1.next(); !overriddenKeys_1_1.done; overriddenKeys_1_1 = overriddenKeys_1.next()) {
                var key = overriddenKeys_1_1.value;
                var originalDetail = finalDetails[key];
                var overrideFlagValue = overridenFlags === null || overridenFlags === void 0 ? void 0 : overridenFlags[key];
                var finalEnabled = (0, core_1.isUndefined)(overrideFlagValue)
                    ? ((_b = originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.enabled) !== null && _b !== void 0 ? _b : false)
                    : !!overrideFlagValue;
                var overrideVariant = (0, core_1.isUndefined)(overrideFlagValue)
                    ? originalDetail.variant
                    : typeof overrideFlagValue === 'string'
                        ? overrideFlagValue
                        : undefined;
                var overridePayload = overriddenPayloads === null || overriddenPayloads === void 0 ? void 0 : overriddenPayloads[key];
                var overridenDetail = __assign(__assign({}, originalDetail), { enabled: finalEnabled, 
                    // If the flag is not enabled, the variant should be undefined, even if the original has a variant value.
                    variant: finalEnabled ? (overrideVariant !== null && overrideVariant !== void 0 ? overrideVariant : originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.variant) : undefined });
                // Keep track of the original enabled and variant values so we can send them in the $feature_flag_called event.
                // This will be helpful for debugging and for understanding the impact of overrides.
                if (finalEnabled !== (originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.enabled)) {
                    overridenDetail.original_enabled = originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.enabled;
                }
                if (overrideVariant !== (originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.variant)) {
                    overridenDetail.original_variant = originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.variant;
                }
                if (overridePayload) {
                    overridenDetail.metadata = __assign(__assign({}, originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.metadata), { payload: overridePayload, original_payload: (_c = originalDetail === null || originalDetail === void 0 ? void 0 : originalDetail.metadata) === null || _c === void 0 ? void 0 : _c.payload });
                }
                finalDetails[key] = overridenDetail;
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (overriddenKeys_1_1 && !overriddenKeys_1_1.done && (_a = overriddenKeys_1.return)) _a.call(overriddenKeys_1);
            }
            finally { if (e_3) throw e_3.error; }
        }
        if (!this._override_warning) {
            logger.warn(' Overriding feature flag details!', {
                flagDetails: flagDetails,
                overriddenPayloads: overriddenPayloads,
                finalDetails: finalDetails,
            });
            this._override_warning = true;
        }
        return finalDetails;
    };
    PostHogFeatureFlags.prototype.getFlagVariants = function () {
        var enabledFlags = this._prop(constants_1.ENABLED_FEATURE_FLAGS);
        var overriddenFlags = this._prop(PERSISTENCE_OVERRIDE_FEATURE_FLAGS);
        if (!overriddenFlags) {
            return enabledFlags || {};
        }
        var finalFlags = (0, utils_1.extend)({}, enabledFlags);
        var overriddenKeys = Object.keys(overriddenFlags);
        for (var i = 0; i < overriddenKeys.length; i++) {
            finalFlags[overriddenKeys[i]] = overriddenFlags[overriddenKeys[i]];
        }
        if (!this._override_warning) {
            logger.warn(' Overriding feature flags!', {
                enabledFlags: enabledFlags,
                overriddenFlags: overriddenFlags,
                finalFlags: finalFlags,
            });
            this._override_warning = true;
        }
        return finalFlags;
    };
    PostHogFeatureFlags.prototype.getFlagPayloads = function () {
        var flagPayloads = this._prop(PERSISTENCE_FEATURE_FLAG_PAYLOADS);
        var overriddenPayloads = this._prop(PERSISTENCE_OVERRIDE_FEATURE_FLAG_PAYLOADS);
        if (!overriddenPayloads) {
            return flagPayloads || {};
        }
        var finalPayloads = (0, utils_1.extend)({}, flagPayloads || {});
        var overriddenKeys = Object.keys(overriddenPayloads);
        for (var i = 0; i < overriddenKeys.length; i++) {
            finalPayloads[overriddenKeys[i]] = overriddenPayloads[overriddenKeys[i]];
        }
        if (!this._override_warning) {
            logger.warn(' Overriding feature flag payloads!', {
                flagPayloads: flagPayloads,
                overriddenPayloads: overriddenPayloads,
                finalPayloads: finalPayloads,
            });
            this._override_warning = true;
        }
        return finalPayloads;
    };
    /**
     * Reloads feature flags asynchronously.
     *
     * Constraints:
     *
     * 1. Avoid parallel requests
     * 2. Delay a few milliseconds after each reloadFeatureFlags call to batch subsequent changes together
     */
    PostHogFeatureFlags.prototype.reloadFeatureFlags = function () {
        var _this = this;
        if (this._reloadingDisabled || this._config.advanced_disable_feature_flags) {
            // If reloading has been explicitly disabled then we don't want to do anything
            // Or if feature flags are disabled
            return;
        }
        if (this._reloadDebouncer) {
            // If we're already in a debounce then we don't want to do anything
            return;
        }
        // Emit event so consumers know flags are being reloaded
        this._instance._internalEventEmitter.emit('featureFlagsReloading', true);
        // Debounce multiple calls on the same tick
        this._reloadDebouncer = setTimeout(function () {
            _this._callFlagsEndpoint();
        }, 5);
    };
    PostHogFeatureFlags.prototype._clearDebouncer = function () {
        clearTimeout(this._reloadDebouncer);
        this._reloadDebouncer = undefined;
    };
    PostHogFeatureFlags.prototype.ensureFlagsLoaded = function () {
        if (this._hasLoadedFlags || this._requestInFlight || this._reloadDebouncer) {
            // If we are or have already loaded the flags then we don't want to do anything
            return;
        }
        this.reloadFeatureFlags();
    };
    PostHogFeatureFlags.prototype.setAnonymousDistinctId = function (anon_distinct_id) {
        this.$anon_distinct_id = anon_distinct_id;
    };
    PostHogFeatureFlags.prototype.setReloadingPaused = function (isPaused) {
        this._reloadingDisabled = isPaused;
    };
    PostHogFeatureFlags.prototype._callFlagsEndpoint = function (options) {
        var _this = this;
        var _a;
        // Ensure we don't have double queued /flags requests
        this._clearDebouncer();
        if (this._instance._shouldDisableFlags()) {
            // The way this is documented is essentially used to refuse to ever call the /flags endpoint.
            return;
        }
        if (this._requestInFlight) {
            this._additionalReloadRequested = true;
            return;
        }
        var token = this._config.token;
        var deviceId = this._prop(constants_1.DEVICE_ID);
        var data = {
            token: token,
            distinct_id: this._instance.get_distinct_id(),
            groups: this._instance.getGroups(),
            $anon_distinct_id: this.$anon_distinct_id,
            person_properties: __assign(__assign({}, (((_a = this._persistence) === null || _a === void 0 ? void 0 : _a.get_initial_props()) || {})), (this._prop(constants_1.STORED_PERSON_PROPERTIES_KEY) || {})),
            group_properties: this._prop(constants_1.STORED_GROUP_PROPERTIES_KEY),
            timezone: (0, event_utils_1.getTimezone)(),
        };
        // Add device_id if available (handle cookieless mode where it's null)
        if (!(0, core_1.isNull)(deviceId) && !(0, core_1.isUndefined)(deviceId)) {
            data.$device_id = deviceId;
        }
        if ((options === null || options === void 0 ? void 0 : options.disableFlags) || this._config.advanced_disable_feature_flags) {
            data.disable_flags = true;
        }
        // Add evaluation contexts if configured
        if (this._shouldIncludeEvaluationEnvironments()) {
            data.evaluation_contexts = this._getValidEvaluationEnvironments();
        }
        var queryParams = this._config.advanced_only_evaluate_survey_feature_flags
            ? '&only_evaluate_survey_feature_flags=true'
            : '';
        var url = this._instance.requestRouter.endpointFor('flags', '/flags/?v=2' + queryParams);
        this._requestInFlight = true;
        this._instance._send_request({
            method: 'POST',
            url: url,
            data: data,
            compression: this._config.disable_compression ? undefined : types_1.Compression.Base64,
            timeout: this._config.feature_flag_request_timeout_ms,
            callback: function (response) {
                var _a;
                var _b, _c, _d, _e, _f;
                var errorsLoading = true;
                if (response.statusCode === 200) {
                    // successful request
                    // reset anon_distinct_id after at least a single request with it
                    // makes it through
                    if (!_this._additionalReloadRequested) {
                        _this.$anon_distinct_id = undefined;
                    }
                    errorsLoading = false;
                }
                _this._requestInFlight = false;
                if (data.disable_flags && !_this._additionalReloadRequested) {
                    // If flags are disabled then there is no need to call /flags again (flags are the only thing that may change)
                    // UNLESS, an additional reload is requested.
                    return;
                }
                _this._flagsLoadedFromRemote = !errorsLoading;
                var flagErrors = [];
                if (response.error) {
                    if (response.error instanceof Error) {
                        flagErrors.push(response.error.name === 'AbortError'
                            ? exports.FeatureFlagError.TIMEOUT
                            : exports.FeatureFlagError.CONNECTION_ERROR);
                    }
                    else {
                        flagErrors.push(exports.FeatureFlagError.UNKNOWN_ERROR);
                    }
                }
                else if (response.statusCode !== 200) {
                    flagErrors.push(exports.FeatureFlagError.apiError(response.statusCode));
                }
                if ((_b = response.json) === null || _b === void 0 ? void 0 : _b.errorsWhileComputingFlags) {
                    flagErrors.push(exports.FeatureFlagError.ERRORS_WHILE_COMPUTING);
                }
                var isQuotaLimited = !!((_d = (_c = response.json) === null || _c === void 0 ? void 0 : _c.quotaLimited) === null || _d === void 0 ? void 0 : _d.includes(exports.QuotaLimitedResource.FeatureFlags));
                if (isQuotaLimited) {
                    flagErrors.push(exports.FeatureFlagError.QUOTA_LIMITED);
                }
                (_e = _this._persistence) === null || _e === void 0 ? void 0 : _e.register((_a = {},
                    _a[constants_1.PERSISTENCE_FEATURE_FLAG_ERRORS] = flagErrors,
                    _a));
                if (isQuotaLimited) {
                    // log a warning and then early return
                    logger.warn('You have hit your feature flags quota limit, and will not be able to load feature flags until the quota is reset.  Please visit https://posthog.com/docs/billing/limits-alerts to learn more.');
                    return;
                }
                if (!data.disable_flags) {
                    _this.receivedFeatureFlags((_f = response.json) !== null && _f !== void 0 ? _f : {}, errorsLoading);
                }
                if (_this._additionalReloadRequested) {
                    _this._additionalReloadRequested = false;
                    _this._callFlagsEndpoint();
                }
            },
        });
    };
    /**
     * Get feature flag's value for user.
     *
     * By default, this method may return cached values from localStorage if the `/flags` endpoint
     * hasn't responded yet. This reduces flicker but means you might briefly see stale values
     * (e.g., a flag that was disabled on the server).
     *
     * ### Usage:
     *
     *     if(posthog.getFeatureFlag('my-flag') === 'some-variant') { // do something }
     *
     *     // Only use fresh values from the server (returns undefined until /flags responds)
     *     if(posthog.getFeatureFlag('my-flag', { fresh: true }) === 'some-variant') { // do something }
     *
     * @param {String} key Key of the feature flag.
     * @param {Object} options Optional settings.
     * @param {boolean} [options.send_event=true] If false, won't send a $feature_flag_called event to PostHog.
     * @param {boolean} [options.fresh=false] If true, only returns values loaded from the server, not cached localStorage values.
     *                  Use this when you need to ensure the flag value reflects the current server state,
     *                  such as after disabling a flag. Returns undefined until the /flags endpoint responds.
     * @returns {boolean | string | undefined} The flag value, or undefined if not found or not yet loaded.
     */
    PostHogFeatureFlags.prototype.getFeatureFlag = function (key, options) {
        var _a;
        if (options === void 0) { options = {}; }
        if (options.fresh && !this._flagsLoadedFromRemote) {
            return undefined;
        }
        if (!this._hasLoadedFlags && !(this.getFlags() && this.getFlags().length > 0)) {
            logger.warn('getFeatureFlag for key "' + key + FLAG_TIMEOUT_MSG);
            return undefined;
        }
        // Check if cache is stale and trigger refresh if needed
        if (this._checkAndTriggerStaleRefresh()) {
            return undefined;
        }
        var result = this.getFeatureFlagResult(key, options);
        return (_a = result === null || result === void 0 ? void 0 : result.variant) !== null && _a !== void 0 ? _a : result === null || result === void 0 ? void 0 : result.enabled;
    };
    /*
     * Retrieves the details for a feature flag.
     *
     * ### Usage:
     *
     *     const details = getFeatureFlagDetails("my-flag")
     *     console.log(details.metadata.version)
     *     console.log(details.reason)
     *
     * @param {String} key Key of the feature flag.
     */
    PostHogFeatureFlags.prototype.getFeatureFlagDetails = function (key) {
        var details = this.getFlagsWithDetails();
        return details[key];
    };
    /**
     * @deprecated Use `getFeatureFlagResult()` instead which properly tracks the feature flag call.
     * `getFeatureFlagPayload()` does not emit the `$feature_flag_called` event which may result in
     * missing analytics. This method will be removed in a future version.
     */
    PostHogFeatureFlags.prototype.getFeatureFlagPayload = function (key) {
        // Don't send event to maintain backwards compatibility - this method never tracked calls
        var result = this.getFeatureFlagResult(key, { send_event: false });
        return result === null || result === void 0 ? void 0 : result.payload;
    };
    /**
     * Get a feature flag result including both the flag value and payload, while properly tracking the call.
     * This method emits the `$feature_flag_called` event by default.
     *
     * By default, this method may return cached values from localStorage if the `/flags` endpoint
     * hasn't responded yet. This reduces flicker but means you might briefly see stale values
     * (e.g., a flag that was disabled on the server).
     *
     * ### Usage:
     *
     *     const result = posthog.getFeatureFlagResult('my-flag')
     *     if (result?.enabled) {
     *         console.log('Flag is enabled with payload:', result.payload)
     *     }
     *
     *     // Only use fresh values from the server
     *     const freshResult = posthog.getFeatureFlagResult('my-flag', { fresh: true })
     *
     * @param {String} key Key of the feature flag.
     * @param {Object} [options] Options for the feature flag lookup.
     * @param {boolean} [options.send_event=true] If false, won't send the $feature_flag_called event.
     * @param {boolean} [options.fresh=false] If true, only returns values loaded from the server, not cached localStorage values.
     *                  Use this when you need to ensure the flag value reflects the current server state.
     *                  Returns undefined until the /flags endpoint responds.
     * @returns {FeatureFlagResult | undefined} The feature flag result including key, enabled, variant, and payload.
     */
    PostHogFeatureFlags.prototype.getFeatureFlagResult = function (key, options) {
        var _a, _b;
        var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        if (options === void 0) { options = {}; }
        if (options.fresh && !this._flagsLoadedFromRemote) {
            return undefined;
        }
        if (!this._hasLoadedFlags && !(this.getFlags() && this.getFlags().length > 0)) {
            logger.warn('getFeatureFlagResult for key "' + key + FLAG_TIMEOUT_MSG);
            return undefined;
        }
        // Check if cache is stale and trigger refresh if needed
        if (this._checkAndTriggerStaleRefresh()) {
            return undefined;
        }
        var flagVariants = this.getFlagVariants();
        var flagExists = key in flagVariants;
        var flagValue = flagVariants[key];
        var payloads = this.getFlagPayloads();
        var payload = payloads[key];
        var flagReportValue = String(flagValue);
        var requestId = this._prop(PERSISTENCE_FEATURE_FLAG_REQUEST_ID) || undefined;
        var evaluatedAt = this._prop(constants_1.PERSISTENCE_FEATURE_FLAG_EVALUATED_AT) || undefined;
        var flagCallReported = this._prop(constants_1.FLAG_CALL_REPORTED) || {};
        // When session-scoped dedup is enabled, reset the reported flags whenever the session changes.
        if (this._config.advanced_feature_flags_dedup_per_session) {
            var currentSessionId = this._instance.get_session_id();
            var storedSessionId = this._prop(constants_1.FLAG_CALL_REPORTED_SESSION_ID);
            if (currentSessionId && currentSessionId !== storedSessionId) {
                flagCallReported = {};
                (_c = this._persistence) === null || _c === void 0 ? void 0 : _c.register((_a = {},
                    _a[constants_1.FLAG_CALL_REPORTED] = flagCallReported,
                    _a[constants_1.FLAG_CALL_REPORTED_SESSION_ID] = currentSessionId,
                    _a));
            }
        }
        if (options.send_event || !('send_event' in options)) {
            if (!(key in flagCallReported) || !flagCallReported[key].includes(flagReportValue)) {
                if ((0, core_1.isArray)(flagCallReported[key])) {
                    flagCallReported[key].push(flagReportValue);
                }
                else {
                    flagCallReported[key] = [flagReportValue];
                }
                (_d = this._persistence) === null || _d === void 0 ? void 0 : _d.register((_b = {}, _b[constants_1.FLAG_CALL_REPORTED] = flagCallReported, _b));
                var flagDetails = this.getFeatureFlagDetails(key);
                var errors = __spreadArray([], __read(((_e = this._prop(constants_1.PERSISTENCE_FEATURE_FLAG_ERRORS)) !== null && _e !== void 0 ? _e : [])), false);
                if ((0, core_1.isUndefined)(flagValue)) {
                    errors.push(exports.FeatureFlagError.FLAG_MISSING);
                }
                var properties = {
                    $feature_flag: key,
                    $feature_flag_response: flagValue,
                    $feature_flag_payload: payload || null,
                    $feature_flag_request_id: requestId,
                    $feature_flag_evaluated_at: evaluatedAt,
                    $feature_flag_bootstrapped_response: ((_g = (_f = this._config.bootstrap) === null || _f === void 0 ? void 0 : _f.featureFlags) === null || _g === void 0 ? void 0 : _g[key]) || null,
                    $feature_flag_bootstrapped_payload: ((_j = (_h = this._config.bootstrap) === null || _h === void 0 ? void 0 : _h.featureFlagPayloads) === null || _j === void 0 ? void 0 : _j[key]) || null,
                    // If we haven't yet received a response from the /flags endpoint, we must have used the bootstrapped value
                    $used_bootstrap_value: !this._flagsLoadedFromRemote,
                };
                if (!(0, core_1.isUndefined)((_k = flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.metadata) === null || _k === void 0 ? void 0 : _k.version)) {
                    properties.$feature_flag_version = flagDetails.metadata.version;
                }
                var reason = (_m = (_l = flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.reason) === null || _l === void 0 ? void 0 : _l.description) !== null && _m !== void 0 ? _m : (_o = flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.reason) === null || _o === void 0 ? void 0 : _o.code;
                if (reason) {
                    properties.$feature_flag_reason = reason;
                }
                if ((_p = flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.metadata) === null || _p === void 0 ? void 0 : _p.id) {
                    properties.$feature_flag_id = flagDetails.metadata.id;
                }
                // It's possible that flag values were overridden by calling overrideFeatureFlags.
                // We want to capture the original values in case someone forgets they were using overrides
                // and is wondering why their app is acting weird.
                if (!(0, core_1.isUndefined)(flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.original_variant) || !(0, core_1.isUndefined)(flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.original_enabled)) {
                    properties.$feature_flag_original_response = !(0, core_1.isUndefined)(flagDetails.original_variant)
                        ? flagDetails.original_variant
                        : flagDetails.original_enabled;
                }
                if ((_q = flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.metadata) === null || _q === void 0 ? void 0 : _q.original_payload) {
                    properties.$feature_flag_original_payload = (_r = flagDetails === null || flagDetails === void 0 ? void 0 : flagDetails.metadata) === null || _r === void 0 ? void 0 : _r.original_payload;
                }
                if (errors.length) {
                    properties.$feature_flag_error = errors.join(',');
                }
                this._instance.capture('$feature_flag_called', properties);
            }
        }
        if (!flagExists) {
            return undefined;
        }
        var parsedPayload = payload;
        if (!(0, core_1.isUndefined)(payload)) {
            try {
                parsedPayload = JSON.parse(payload);
            }
            catch (_s) {
                // payload is already parsed or not valid JSON, keep as-is
            }
        }
        return {
            key: key,
            enabled: !!flagValue,
            variant: typeof flagValue === 'string' ? flagValue : undefined,
            payload: parsedPayload,
        };
    };
    /*
     * Fetches the payload for a remote config feature flag. This method will bypass any cached values and fetch the latest
     * value from the PostHog API.
     *
     * Note: Because the posthog-js SDK is primarily used with public project API keys, encrypted remote config payloads will
     * be redacted, never decrypted in the response.
     *
     * ### Usage:
     *
     *     getRemoteConfigPayload("home-page-welcome-message", (payload) => console.log(`Fetched remote config: ${payload}`))
     *
     * @param {String} key Key of the feature flag.
     * @param {Function} [callback] The callback function will be called once the remote config feature flag payload has been fetched.
     */
    PostHogFeatureFlags.prototype.getRemoteConfigPayload = function (key, callback) {
        var token = this._config.token;
        var data = {
            distinct_id: this._instance.get_distinct_id(),
            token: token,
        };
        // Add evaluation contexts if configured
        if (this._shouldIncludeEvaluationEnvironments()) {
            data.evaluation_contexts = this._getValidEvaluationEnvironments();
        }
        this._instance._send_request({
            method: 'POST',
            url: this._instance.requestRouter.endpointFor('flags', '/flags/?v=2'),
            data: data,
            compression: this._config.disable_compression ? undefined : types_1.Compression.Base64,
            timeout: this._config.feature_flag_request_timeout_ms,
            callback: function (response) {
                var _a;
                var flagPayloads = (_a = response.json) === null || _a === void 0 ? void 0 : _a['featureFlagPayloads'];
                callback((flagPayloads === null || flagPayloads === void 0 ? void 0 : flagPayloads[key]) || undefined);
            },
        });
    };
    /**
     * See if feature flag is enabled for user.
     *
     * By default, this method may return cached values from localStorage if the `/flags` endpoint
     * hasn't responded yet. This reduces flicker but means you might briefly see stale values
     * (e.g., a flag that was disabled on the server).
     *
     * ### Usage:
     *
     *     if(posthog.isFeatureEnabled('beta-feature')) { // do something }
     *
     *     // Only use fresh values from the server
     *     if(posthog.isFeatureEnabled('beta-feature', { fresh: true })) { // do something }
     *
     * @param {String} key Key of the feature flag.
     * @param {Object} [options] Optional settings.
     * @param {boolean} [options.send_event=true] If false, won't send a $feature_flag_called event to PostHog.
     * @param {boolean} [options.fresh=false] If true, only returns values loaded from the server, not cached localStorage values.
     *                  Use this when you need to ensure the flag value reflects the current server state.
     *                  Returns undefined until the /flags endpoint responds.
     * @returns {boolean | undefined} Whether the flag is enabled, or undefined if not found or not yet loaded.
     */
    PostHogFeatureFlags.prototype.isFeatureEnabled = function (key, options) {
        if (options === void 0) { options = {}; }
        if (options.fresh && !this._flagsLoadedFromRemote) {
            return undefined;
        }
        if (!this._hasLoadedFlags && !(this.getFlags() && this.getFlags().length > 0)) {
            logger.warn('isFeatureEnabled for key "' + key + FLAG_TIMEOUT_MSG);
            return undefined;
        }
        var flagValue = this.getFeatureFlag(key, options);
        return (0, core_1.isUndefined)(flagValue) ? undefined : !!flagValue;
    };
    PostHogFeatureFlags.prototype.addFeatureFlagsHandler = function (handler) {
        this.featureFlagEventHandlers.push(handler);
    };
    PostHogFeatureFlags.prototype.removeFeatureFlagsHandler = function (handler) {
        this.featureFlagEventHandlers = this.featureFlagEventHandlers.filter(function (h) { return h !== handler; });
    };
    PostHogFeatureFlags.prototype.receivedFeatureFlags = function (response, errorsLoading) {
        if (!this._persistence) {
            return;
        }
        this._hasLoadedFlags = true;
        var currentFlags = this.getFlagVariants();
        var currentFlagPayloads = this.getFlagPayloads();
        var currentFlagDetails = this.getFlagsWithDetails();
        (0, exports.parseFlagsResponse)(response, this._persistence, currentFlags, currentFlagPayloads, currentFlagDetails);
        // Reset stale refresh flag when we successfully receive fresh flags
        if (!errorsLoading) {
            this._staleCacheRefreshTriggered = false;
        }
        this._fireFeatureFlagsCallbacks(errorsLoading);
    };
    /**
     * @deprecated Use overrideFeatureFlags instead. This will be removed in a future version.
     */
    PostHogFeatureFlags.prototype.override = function (flags, suppressWarning) {
        if (suppressWarning === void 0) { suppressWarning = false; }
        logger.warn('override is deprecated. Please use overrideFeatureFlags instead.');
        this.overrideFeatureFlags({
            flags: flags,
            suppressWarning: suppressWarning,
        });
    };
    /**
     * Override feature flags on the client-side. Useful for setting non-persistent feature flags,
     * or for testing/debugging feature flags in the PostHog app.
     *
     * ### Usage:
     *
     *     - posthog.featureFlags.overrideFeatureFlags(false) // clear all overrides
     *     - posthog.featureFlags.overrideFeatureFlags(['beta-feature']) // enable flags
     *     - posthog.featureFlags.overrideFeatureFlags({'beta-feature': 'variant'}) // set variants
     *     - posthog.featureFlags.overrideFeatureFlags({ flags: ['beta-feature'] }) // enable flags
     *     - posthog.featureFlags.overrideFeatureFlags({ flags: {'beta-feature': 'variant'} }) // set variants
     *     - posthog.featureFlags.overrideFeatureFlags({ // set both flags and payloads
     *         flags: {'beta-feature': 'variant'},
     *         payloads: { 'beta-feature': { someData: true } }
     *       })
     *     - posthog.featureFlags.overrideFeatureFlags({ // only override payloads
     *         payloads: { 'beta-feature': { someData: true } }
     *       })
     */
    PostHogFeatureFlags.prototype.overrideFeatureFlags = function (overrideOptions) {
        var _a, _b, _c, _d, _e;
        var _f;
        if (!this._instance.__loaded || !this._persistence) {
            return logger.uninitializedWarning('posthog.featureFlags.overrideFeatureFlags');
        }
        // Clear all overrides if false, lets you do something like posthog.featureFlags.overrideFeatureFlags(false)
        if (overrideOptions === false) {
            this._persistence.unregister(PERSISTENCE_OVERRIDE_FEATURE_FLAGS);
            this._persistence.unregister(PERSISTENCE_OVERRIDE_FEATURE_FLAG_PAYLOADS);
            this._fireFeatureFlagsCallbacks();
            return forceDebugLogger.info('All overrides cleared');
        }
        // Array syntax: ['flag-a', 'flag-b'] -> { 'flag-a': true, 'flag-b': true }
        if ((0, core_1.isArray)(overrideOptions)) {
            var flagsObj = arrayToFlagsRecord(overrideOptions);
            this._persistence.register((_a = {}, _a[PERSISTENCE_OVERRIDE_FEATURE_FLAGS] = flagsObj, _a));
            this._fireFeatureFlagsCallbacks();
            return forceDebugLogger.info('Flag overrides set', { flags: overrideOptions });
        }
        if (overrideOptions &&
            typeof overrideOptions === 'object' &&
            ('flags' in overrideOptions || 'payloads' in overrideOptions)) {
            var options = overrideOptions;
            this._override_warning = Boolean((_f = options.suppressWarning) !== null && _f !== void 0 ? _f : false);
            // Handle flags if provided, lets you do something like posthog.featureFlags.overrideFeatureFlags({flags: ['beta-feature']})
            if ('flags' in options) {
                if (options.flags === false) {
                    this._persistence.unregister(PERSISTENCE_OVERRIDE_FEATURE_FLAGS);
                    forceDebugLogger.info('Flag overrides cleared');
                }
                else if (options.flags) {
                    if ((0, core_1.isArray)(options.flags)) {
                        var flagsObj = arrayToFlagsRecord(options.flags);
                        this._persistence.register((_b = {}, _b[PERSISTENCE_OVERRIDE_FEATURE_FLAGS] = flagsObj, _b));
                    }
                    else {
                        this._persistence.register((_c = {}, _c[PERSISTENCE_OVERRIDE_FEATURE_FLAGS] = options.flags, _c));
                    }
                    forceDebugLogger.info('Flag overrides set', { flags: options.flags });
                }
            }
            // Handle payloads independently, lets you do something like posthog.featureFlags.overrideFeatureFlags({payloads: { 'beta-feature': { someData: true } }})
            if ('payloads' in options) {
                if (options.payloads === false) {
                    this._persistence.unregister(PERSISTENCE_OVERRIDE_FEATURE_FLAG_PAYLOADS);
                    forceDebugLogger.info('Payload overrides cleared');
                }
                else if (options.payloads) {
                    this._persistence.register((_d = {},
                        _d[PERSISTENCE_OVERRIDE_FEATURE_FLAG_PAYLOADS] = options.payloads,
                        _d));
                    forceDebugLogger.info('Payload overrides set', { payloads: options.payloads });
                }
            }
            this._fireFeatureFlagsCallbacks();
            return;
        }
        // Fallback: treat as Record<string, string | boolean>, e.g. {'beta-feature': 'variant'}
        if (overrideOptions && typeof overrideOptions === 'object') {
            this._persistence.register((_e = {},
                _e[PERSISTENCE_OVERRIDE_FEATURE_FLAGS] = overrideOptions,
                _e));
            this._fireFeatureFlagsCallbacks();
            return forceDebugLogger.info('Flag overrides set', { flags: overrideOptions });
        }
        logger.warn('Invalid overrideOptions provided to overrideFeatureFlags', { overrideOptions: overrideOptions });
    };
    /*
     * Register an event listener that runs when feature flags become available or when they change.
     * If there are flags, the listener is called immediately in addition to being called on future changes.
     *
     * ### Usage:
     *
     *     posthog.onFeatureFlags(function(featureFlags, featureFlagsVariants, { errorsLoading }) { // do something })
     *
     * @param {Function} [callback] The callback function will be called once the feature flags are ready or when they are updated.
     *                              It'll return a list of feature flags enabled for the user, the variants,
     *                              and also a context object indicating whether we succeeded to fetch the flags or not.
     * @returns {Function} A function that can be called to unsubscribe the listener. Used by useEffect when the component unmounts.
     */
    PostHogFeatureFlags.prototype.onFeatureFlags = function (callback) {
        var _this = this;
        this.addFeatureFlagsHandler(callback);
        if (this._hasLoadedFlags) {
            var _a = this._prepareFeatureFlagsForCallbacks(), flags = _a.flags, flagVariants = _a.flagVariants;
            callback(flags, flagVariants);
        }
        return function () { return _this.removeFeatureFlagsHandler(callback); };
    };
    PostHogFeatureFlags.prototype.updateEarlyAccessFeatureEnrollment = function (key, isEnrolled, stage) {
        var _a, _b, _c;
        var _d;
        var existing_early_access_features = this._prop(constants_1.PERSISTENCE_EARLY_ACCESS_FEATURES) || [];
        var feature = existing_early_access_features.find(function (f) { return f.flagKey === key; });
        var enrollmentPersonProp = (_a = {},
            _a["$feature_enrollment/".concat(key)] = isEnrolled,
            _a);
        var properties = {
            $feature_flag: key,
            $feature_enrollment: isEnrolled,
            $set: enrollmentPersonProp,
        };
        if (feature) {
            properties['$early_access_feature_name'] = feature.name;
        }
        if (stage) {
            properties['$feature_enrollment_stage'] = stage;
        }
        this._instance.capture('$feature_enrollment_update', properties);
        this.setPersonPropertiesForFlags(enrollmentPersonProp, false);
        var newFlags = __assign(__assign({}, this.getFlagVariants()), (_b = {}, _b[key] = isEnrolled, _b));
        (_d = this._persistence) === null || _d === void 0 ? void 0 : _d.register((_c = {},
            _c[PERSISTENCE_ACTIVE_FEATURE_FLAGS] = Object.keys((0, exports.filterActiveFeatureFlags)(newFlags)),
            _c[constants_1.ENABLED_FEATURE_FLAGS] = newFlags,
            _c));
        this._fireFeatureFlagsCallbacks();
    };
    PostHogFeatureFlags.prototype.getEarlyAccessFeatures = function (callback, force_reload, stages) {
        var _this = this;
        if (force_reload === void 0) { force_reload = false; }
        var existing_early_access_features = this._prop(constants_1.PERSISTENCE_EARLY_ACCESS_FEATURES);
        var stageParams = stages ? "&".concat(stages.map(function (s) { return "stage=".concat(s); }).join('&')) : '';
        if (!existing_early_access_features || force_reload) {
            this._instance._send_request({
                url: this._instance.requestRouter.endpointFor('api', "/api/early_access_features/?token=".concat(this._config.token).concat(stageParams)),
                method: 'GET',
                callback: function (response) {
                    var _a;
                    var _b, _c;
                    if (!response.json) {
                        return;
                    }
                    var earlyAccessFeatures = response.json.earlyAccessFeatures;
                    // Unregister first to ensure complete replacement, not merge
                    // This prevents accumulation of stale features in persistence
                    (_b = _this._persistence) === null || _b === void 0 ? void 0 : _b.unregister(constants_1.PERSISTENCE_EARLY_ACCESS_FEATURES);
                    (_c = _this._persistence) === null || _c === void 0 ? void 0 : _c.register((_a = {}, _a[constants_1.PERSISTENCE_EARLY_ACCESS_FEATURES] = earlyAccessFeatures, _a));
                    return callback(earlyAccessFeatures);
                },
            });
        }
        else {
            return callback(existing_early_access_features);
        }
    };
    PostHogFeatureFlags.prototype._prepareFeatureFlagsForCallbacks = function () {
        var flags = this.getFlags();
        var flagVariants = this.getFlagVariants();
        // Return truthy
        var truthyFlags = flags.filter(function (flag) { return flagVariants[flag]; });
        var truthyFlagVariants = Object.keys(flagVariants)
            .filter(function (variantKey) { return flagVariants[variantKey]; })
            .reduce(function (res, key) {
            res[key] = flagVariants[key];
            return res;
        }, {});
        return {
            flags: truthyFlags,
            flagVariants: truthyFlagVariants,
        };
    };
    PostHogFeatureFlags.prototype._fireFeatureFlagsCallbacks = function (errorsLoading) {
        var _a = this._prepareFeatureFlagsForCallbacks(), flags = _a.flags, flagVariants = _a.flagVariants;
        this.featureFlagEventHandlers.forEach(function (handler) { return handler(flags, flagVariants, { errorsLoading: errorsLoading }); });
    };
    /**
     * Set override person properties for feature flags.
     * This is used when dealing with new persons / where you don't want to wait for ingestion
     * to update user properties.
     */
    PostHogFeatureFlags.prototype.setPersonPropertiesForFlags = function (properties, reloadFeatureFlags) {
        var _a;
        if (reloadFeatureFlags === void 0) { reloadFeatureFlags = true; }
        // Get persisted person properties
        var existingProperties = this._prop(constants_1.STORED_PERSON_PROPERTIES_KEY) || {};
        this._instance.register((_a = {},
            _a[constants_1.STORED_PERSON_PROPERTIES_KEY] = __assign(__assign({}, existingProperties), properties),
            _a));
        if (reloadFeatureFlags) {
            this._instance.reloadFeatureFlags();
        }
    };
    PostHogFeatureFlags.prototype.resetPersonPropertiesForFlags = function () {
        this._instance.unregister(constants_1.STORED_PERSON_PROPERTIES_KEY);
    };
    /**
     * Set override group properties for feature flags.
     * This is used when dealing with new groups / where you don't want to wait for ingestion
     * to update properties.
     * Takes in an object, the key of which is the group type.
     * For example:
     *     setGroupPropertiesForFlags({'organization': { name: 'CYZ', employees: '11' } })
     */
    PostHogFeatureFlags.prototype.setGroupPropertiesForFlags = function (properties, reloadFeatureFlags) {
        var _a;
        if (reloadFeatureFlags === void 0) { reloadFeatureFlags = true; }
        // Get persisted group properties
        var existingProperties = this._prop(constants_1.STORED_GROUP_PROPERTIES_KEY) || {};
        if (Object.keys(existingProperties).length !== 0) {
            Object.keys(existingProperties).forEach(function (groupType) {
                existingProperties[groupType] = __assign(__assign({}, existingProperties[groupType]), properties[groupType]);
                delete properties[groupType];
            });
        }
        this._instance.register((_a = {},
            _a[constants_1.STORED_GROUP_PROPERTIES_KEY] = __assign(__assign({}, existingProperties), properties),
            _a));
        if (reloadFeatureFlags) {
            this._instance.reloadFeatureFlags();
        }
    };
    PostHogFeatureFlags.prototype.resetGroupPropertiesForFlags = function (group_type) {
        var _a, _b;
        if (group_type) {
            var existingProperties = this._prop(constants_1.STORED_GROUP_PROPERTIES_KEY) || {};
            this._instance.register((_a = {},
                _a[constants_1.STORED_GROUP_PROPERTIES_KEY] = __assign(__assign({}, existingProperties), (_b = {}, _b[group_type] = {}, _b)),
                _a));
        }
        else {
            this._instance.unregister(constants_1.STORED_GROUP_PROPERTIES_KEY);
        }
    };
    PostHogFeatureFlags.prototype.reset = function () {
        this._hasLoadedFlags = false;
        this._requestInFlight = false;
        this._reloadingDisabled = false;
        this._additionalReloadRequested = false;
        this._flagsLoadedFromRemote = false;
        this.$anon_distinct_id = undefined;
        this._clearDebouncer();
        this._override_warning = false;
    };
    return PostHogFeatureFlags;
}());
exports.PostHogFeatureFlags = PostHogFeatureFlags;
//# sourceMappingURL=posthog-featureflags.js.map