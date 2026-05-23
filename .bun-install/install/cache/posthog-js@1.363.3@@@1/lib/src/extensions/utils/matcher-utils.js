"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doesDeviceTypeMatch = doesDeviceTypeMatch;
exports.hasPeriodPassed = hasPeriodPassed;
var core_1 = require("@posthog/core");
var globals_1 = require("../../utils/globals");
var property_utils_1 = require("../../utils/property-utils");
function doesDeviceTypeMatch(deviceTypes, matchType) {
    var _a, _b, _c;
    if (!deviceTypes || deviceTypes.length === 0) {
        return true;
    }
    if (!globals_1.userAgent) {
        return false;
    }
    var deviceType = (0, core_1.detectDeviceType)(globals_1.userAgent, {
        // eslint-disable-next-line compat/compat
        userAgentDataPlatform: (_a = globals_1.navigator === null || globals_1.navigator === void 0 ? void 0 : globals_1.navigator.userAgentData) === null || _a === void 0 ? void 0 : _a.platform,
        maxTouchPoints: globals_1.navigator === null || globals_1.navigator === void 0 ? void 0 : globals_1.navigator.maxTouchPoints,
        screenWidth: (_b = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.screen) === null || _b === void 0 ? void 0 : _b.width,
        screenHeight: (_c = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.screen) === null || _c === void 0 ? void 0 : _c.height,
        devicePixelRatio: globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.devicePixelRatio,
    });
    return property_utils_1.propertyComparisons[matchType !== null && matchType !== void 0 ? matchType : 'icontains'](deviceTypes, [deviceType]);
}
function hasPeriodPassed(periodDays, lastSeenDate) {
    if (!periodDays || !lastSeenDate) {
        return true;
    }
    var date = typeof lastSeenDate === 'string' ? new Date(lastSeenDate) : lastSeenDate;
    var now = new Date();
    var diffMs = Math.abs(now.getTime() - date.getTime());
    var diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
    return diffDays > periodDays;
}
//# sourceMappingURL=matcher-utils.js.map