"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESTORE_QUERY_PARAM = void 0;
exports.isCurrentDomainAllowed = isCurrentDomainAllowed;
exports.getRestoreTokenFromUrl = getRestoreTokenFromUrl;
exports.clearRestoreTokenFromUrl = clearRestoreTokenFromUrl;
var logger_1 = require("../../../utils/logger");
var globals_1 = require("../../../utils/globals");
var logger = (0, logger_1.createLogger)('[ConversationsManager]');
exports.RESTORE_QUERY_PARAM = 'ph_conv_restore';
/**
 * Extract hostname from a domain string (handles URLs and plain hostnames)
 */
function extractHostname(domain) {
    var hostname = domain.replace(/^https?:\/\//, '');
    hostname = hostname.split('/')[0].split('?')[0].split(':')[0];
    return hostname || null;
}
/**
 * Check if the current domain matches the allowed domains list.
 * Returns true if:
 * - domains is empty or not present (no restriction)
 * - current hostname matches any allowed domain
 */
function isCurrentDomainAllowed(domains) {
    var _a;
    if (!domains || domains.length === 0) {
        return true;
    }
    var currentHostname = (_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.location) === null || _a === void 0 ? void 0 : _a.hostname;
    if (!currentHostname) {
        return true;
    }
    return domains.some(function (domain) {
        var allowedHostname = extractHostname(domain);
        if (!allowedHostname) {
            return false;
        }
        if (allowedHostname.startsWith('*.')) {
            var pattern = allowedHostname.slice(2);
            return currentHostname.endsWith(".".concat(pattern)) || currentHostname === pattern;
        }
        return currentHostname === allowedHostname;
    });
}
function getRestoreTokenFromUrl() {
    var _a;
    if (!((_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.location) === null || _a === void 0 ? void 0 : _a.search)) {
        return null;
    }
    try {
        // eslint-disable-next-line compat/compat
        var params = new URLSearchParams(globals_1.window.location.search);
        var token = params.get(exports.RESTORE_QUERY_PARAM);
        return (token === null || token === void 0 ? void 0 : token.trim()) || null;
    }
    catch (error) {
        logger.warn('Failed to parse restore token from URL', error);
        return null;
    }
}
function clearRestoreTokenFromUrl() {
    var _a;
    if (!(globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.location) || !((_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.history) === null || _a === void 0 ? void 0 : _a.replaceState)) {
        return;
    }
    try {
        // eslint-disable-next-line compat/compat
        var url = new URL(globals_1.window.location.href);
        url.searchParams.delete(exports.RESTORE_QUERY_PARAM);
        var newUrl = "".concat(url.pathname).concat(url.search).concat(url.hash);
        globals_1.window.history.replaceState(globals_1.window.history.state, '', newUrl);
    }
    catch (error) {
        logger.warn('Failed to clear restore token from URL', error);
    }
}
//# sourceMappingURL=url-utils.js.map