"use strict";
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
exports.stripEmptyProperties = exports.safewrapClass = exports.safewrap = exports.trySafe = exports.extend = void 0;
exports.find = find;
exports.eachArray = eachArray;
exports.each = each;
exports.entries = entries;
exports._copyAndTruncateStrings = _copyAndTruncateStrings;
exports.isCrossDomainCookie = isCrossDomainCookie;
exports.addEventListener = addEventListener;
exports.migrateConfigField = migrateConfigField;
exports.isToolbarInstance = isToolbarInstance;
var logger_1 = require("./logger");
var core_1 = require("@posthog/core");
function find(value, predicate) {
    for (var i = 0; i < value.length; i++) {
        if (predicate(value[i])) {
            return value[i];
        }
    }
    return undefined;
}
function eachArray(obj, iterator) {
    if ((0, core_1.isArray)(obj)) {
        obj.forEach(iterator);
    }
}
function each(obj, iterator) {
    if ((0, core_1.isNullish)(obj)) {
        return;
    }
    if ((0, core_1.isArray)(obj)) {
        obj.forEach(iterator);
        return;
    }
    if ((0, core_1.isFormData)(obj)) {
        obj.forEach(function (val, key) { return iterator(val, key); });
        return;
    }
    for (var key in obj) {
        if (core_1.hasOwnProperty.call(obj, key)) {
            iterator(obj[key], key);
        }
    }
}
var extend = function (obj) {
    var e_1, _a;
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    try {
        for (var args_1 = __values(args), args_1_1 = args_1.next(); !args_1_1.done; args_1_1 = args_1.next()) {
            var source = args_1_1.value;
            for (var prop in source) {
                if (source[prop] !== void 0) {
                    obj[prop] = source[prop];
                }
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (args_1_1 && !args_1_1.done && (_a = args_1.return)) _a.call(args_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return obj;
};
exports.extend = extend;
/**
 * Object.entries() polyfill
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
 */
function entries(obj) {
    var ownProps = Object.keys(obj);
    var i = ownProps.length;
    var resArray = new Array(i); // preallocate the Array
    while (i--) {
        resArray[i] = [ownProps[i], obj[ownProps[i]]];
    }
    return resArray;
}
var trySafe = function (fn) {
    try {
        return fn();
    }
    catch (_a) {
        return undefined;
    }
};
exports.trySafe = trySafe;
var safewrap = function (f) {
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            return f.apply(this, args);
        }
        catch (e) {
            logger_1.logger.critical('Implementation error. Please turn on debug mode and open a ticket on https://app.posthog.com/home#panel=support%3Asupport%3A.');
            logger_1.logger.critical(e);
        }
    };
};
exports.safewrap = safewrap;
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
var safewrapClass = function (klass, functions) {
    for (var i = 0; i < functions.length; i++) {
        klass.prototype[functions[i]] = (0, exports.safewrap)(klass.prototype[functions[i]]);
    }
};
exports.safewrapClass = safewrapClass;
var stripEmptyProperties = function (p) {
    var ret = {};
    each(p, function (v, k) {
        if (((0, core_1.isString)(v) && v.length > 0) || (0, core_1.isNumber)(v)) {
            ret[k] = v;
        }
    });
    return ret;
};
exports.stripEmptyProperties = stripEmptyProperties;
/**
 * Deep copies an object.
 * It handles cycles by replacing all references to them with `undefined`
 * Also supports customizing native values
 *
 * @param value
 * @param customizer
 * @returns {{}|undefined|*}
 */
function deepCircularCopy(value, customizer) {
    var COPY_IN_PROGRESS_SET = new Set();
    function internalDeepCircularCopy(value, key) {
        if (value !== Object(value))
            return customizer ? customizer(value, key) : value; // primitive value
        if (COPY_IN_PROGRESS_SET.has(value))
            return undefined;
        COPY_IN_PROGRESS_SET.add(value);
        var result;
        if ((0, core_1.isArray)(value)) {
            result = [];
            eachArray(value, function (it) {
                result.push(internalDeepCircularCopy(it));
            });
        }
        else {
            result = {};
            each(value, function (val, key) {
                if (!COPY_IN_PROGRESS_SET.has(val)) {
                    ;
                    result[key] = internalDeepCircularCopy(val, key);
                }
            });
        }
        return result;
    }
    return internalDeepCircularCopy(value);
}
function _copyAndTruncateStrings(object, maxStringLength) {
    return deepCircularCopy(object, function (value) {
        if ((0, core_1.isString)(value) && !(0, core_1.isNull)(maxStringLength)) {
            return value.slice(0, maxStringLength);
        }
        return value;
    });
}
// NOTE: Update PostHogConfig docs if you change this list
// We will not try to catch all bullets here, but we should make an effort to catch the most common ones
// You should be highly against adding more to this list, because ultimately customers can configure
// their `cross_subdomain_cookie` setting to anything they want.
var EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE = ['herokuapp.com', 'vercel.app', 'netlify.app'];
function isCrossDomainCookie(documentLocation) {
    var e_2, _a;
    var hostname = documentLocation === null || documentLocation === void 0 ? void 0 : documentLocation.hostname;
    if (!(0, core_1.isString)(hostname)) {
        return false;
    }
    // split and slice isn't a great way to match arbitrary domains,
    // but it's good enough for ensuring we only match herokuapp.com when it is the TLD
    // for the hostname
    var lastTwoParts = hostname.split('.').slice(-2).join('.');
    try {
        for (var EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1 = __values(EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE), EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1_1 = EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1.next(); !EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1_1.done; EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1_1 = EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1.next()) {
            var excluded = EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1_1.value;
            if (lastTwoParts === excluded) {
                return false;
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1_1 && !EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1_1.done && (_a = EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1.return)) _a.call(EXCLUDED_FROM_CROSS_SUBDOMAIN_COOKIE_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return true;
}
// Use this instead of element.addEventListener to avoid eslint errors
// this properly implements the default options for passive event listeners
function addEventListener(element, event, callback, options) {
    var _a = options !== null && options !== void 0 ? options : {}, _b = _a.capture, capture = _b === void 0 ? false : _b, _c = _a.passive, passive = _c === void 0 ? true : _c;
    // This is the only place where we are allowed to call this function
    // because the whole idea is that we should be calling this instead of the built-in one
    // eslint-disable-next-line posthog-js/no-add-event-listener
    element === null || element === void 0 ? void 0 : element.addEventListener(event, callback, { capture: capture, passive: passive });
}
/**
 * Helper to migrate deprecated config fields to new field names with appropriate warnings
 * @param config - The config object to check
 * @param newField - The new field name to use
 * @param oldField - The deprecated field name to check for
 * @param defaultValue - The default value if neither field is set
 * @param loggerInstance - Optional logger instance for deprecation warnings
 * @returns The value to use (new field takes precedence over old field)
 */
function migrateConfigField(config, newField, oldField, defaultValue, loggerInstance) {
    var hasNewField = newField in config && !(0, core_1.isNullish)(config[newField]);
    var hasOldField = oldField in config && !(0, core_1.isNullish)(config[oldField]);
    if (hasNewField) {
        return config[newField];
    }
    if (hasOldField) {
        if (loggerInstance) {
            loggerInstance.warn("Config field '".concat(oldField, "' is deprecated. Please use '").concat(newField, "' instead. ") +
                "The old field will be removed in a future major version.");
        }
        return config[oldField];
    }
    return defaultValue;
}
var TOOLBAR_INTERNAL_INSTANCE_NAME = 'ph_toolbar_internal';
function isToolbarInstance(config) {
    return config.name === TOOLBAR_INTERNAL_INSTANCE_NAME;
}
//# sourceMappingURL=index.js.map