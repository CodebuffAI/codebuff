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
Object.defineProperty(exports, "__esModule", { value: true });
var api_logs_1 = require("@opentelemetry/api-logs");
var exporter_logs_otlp_http_1 = require("@opentelemetry/exporter-logs-otlp-http");
var sdk_logs_1 = require("@opentelemetry/sdk-logs");
var resources_1 = require("@opentelemetry/resources");
var globals_1 = require("../utils/globals");
var core_1 = require("@posthog/core");
var setupOpenTelemetry = function (posthog) {
    var _a;
    var serviceName = ((_a = posthog.config.logs) === null || _a === void 0 ? void 0 : _a.serviceName) || 'posthog-browser-logs';
    var attributes = {
        'service.name': serviceName,
        host: globals_1.assignableWindow.location.host,
    };
    if (posthog.sessionManager) {
        var _b = posthog.sessionManager.checkAndGetSessionAndWindowId(true), sessionId = _b.sessionId, windowId = _b.windowId;
        attributes = __assign(__assign({}, attributes), { 'session.id': sessionId, 'window.id': windowId });
    }
    api_logs_1.logs.setGlobalLoggerProvider(new sdk_logs_1.LoggerProvider({
        resource: (0, resources_1.resourceFromAttributes)(attributes),
        processors: [
            new sdk_logs_1.BatchLogRecordProcessor(new exporter_logs_otlp_http_1.OTLPLogExporter({
                url: "".concat(posthog.config.api_host, "/i/v1/logs?token=").concat(posthog.config.token),
                // 1. Force the content type to text/plain to avoid OPTIONS preflight
                headers: {
                    'Content-Type': 'text/plain',
                },
            })),
        ],
    }));
};
var LOG_BODY_SIZE_LIMIT = 10000;
var LOG_ATTRIBUTES_LIMIT = 50;
/**
 * Flattens a nested object into a single level dot-notation object.
 * By default limit to 200kB or 50 keys.
 */
var flattenObject = function (obj, prefix, result, keys_limit, size_limit, seen) {
    if (prefix === void 0) { prefix = ''; }
    if (result === void 0) { result = {}; }
    if (keys_limit === void 0) { keys_limit = LOG_ATTRIBUTES_LIMIT; }
    if (size_limit === void 0) { size_limit = LOG_BODY_SIZE_LIMIT; }
    if (seen === void 0) { seen = new WeakSet(); }
    if (seen.has(obj)) {
        result[prefix || 'circular'] = '[Circular]';
        return result;
    }
    seen.add(obj);
    for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            var value = obj[key];
            var newKey = prefix ? "".concat(prefix, ".").concat(key) : key;
            if ((0, core_1.isObject)(value)) {
                flattenObject(value, newKey, result, keys_limit, size_limit, seen);
            }
            else {
                keys_limit -= 1;
                size_limit -= String(value).length;
                size_limit -= newKey.length;
                if (keys_limit <= 0 || size_limit <= 0) {
                    result['attributes_truncated'] = true;
                    return;
                }
                else {
                    result[newKey] = value;
                }
            }
        }
    }
    return result;
};
var SEVERITY_MAP = {
    log: 'INFO',
    warn: 'WARNING',
    error: 'ERROR',
    debug: 'DEBUG',
    info: 'INFO',
};
var initializeLogs = function (posthog) {
    var e_1, _a;
    setupOpenTelemetry(posthog);
    var logger = api_logs_1.logs.getLogger('console');
    var attributes = {};
    if (posthog.sessionManager) {
        var _b = posthog.sessionManager.checkAndGetSessionAndWindowId(true), sessionStartTimestamp = _b.sessionStartTimestamp, lastActivityTimestamp = _b.lastActivityTimestamp;
        attributes = {
            sessionStartTimestamp: sessionStartTimestamp.toString(),
            lastActivityTimestamp: lastActivityTimestamp.toString(),
        };
    }
    var _loop_1 = function (level) {
        var createReplacer = function () {
            var seen = new WeakSet();
            return function (_, value) {
                if (value instanceof Error) {
                    return __assign(__assign({}, value), { name: value.name, message: value.message, stack: value.stack });
                }
                if (typeof value === 'object' && !(0, core_1.isNull)(value)) {
                    if (seen.has(value)) {
                        return '[Circular]';
                    }
                    seen.add(value);
                }
                return value;
            };
        };
        var logWrapper = function (originalConsoleLog) {
            return function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                if (args.length > 0) {
                    var body = args.map(function (a) { return JSON.stringify(a, createReplacer()); }).join(' ');
                    if (body.length > LOG_BODY_SIZE_LIMIT) {
                        body = body.slice(0, LOG_BODY_SIZE_LIMIT) + '...';
                        attributes.body_truncated = 'true';
                    }
                    logger.emit({
                        severityText: SEVERITY_MAP[level],
                        body: body,
                        attributes: __assign(__assign({ 'log.source': "console.".concat(level), distinct_id: posthog.get_distinct_id(), 'location.href': globals_1.assignableWindow.location.href }, attributes), ((0, core_1.isObject)(args[0]) ? flattenObject(args[0]) : {})),
                    });
                    originalConsoleLog.apply(globals_1.assignableWindow.console, args);
                }
            };
        };
        var originalConsoleLog = globals_1.assignableWindow.console[level];
        globals_1.assignableWindow.console[level] = logWrapper(originalConsoleLog);
    };
    try {
        for (var _c = __values(['debug', 'log', 'warn', 'error', 'info']), _d = _c.next(); !_d.done; _d = _c.next()) {
            var level = _d.value;
            _loop_1(level);
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
        }
        finally { if (e_1) throw e_1.error; }
    }
};
globals_1.assignableWindow.__PosthogExtensions__ = globals_1.assignableWindow.__PosthogExtensions__ || {};
globals_1.assignableWindow.__PosthogExtensions__.logs = { initializeLogs: initializeLogs };
//# sourceMappingURL=logs.js.map