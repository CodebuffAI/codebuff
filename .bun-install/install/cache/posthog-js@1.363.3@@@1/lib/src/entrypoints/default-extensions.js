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
var posthog_core_1 = require("../posthog-core");
var extension_bundles_1 = require("../extensions/extension-bundles");
posthog_core_1.PostHog.__defaultExtensionClasses = __assign({}, extension_bundles_1.AllExtensions);
//# sourceMappingURL=default-extensions.js.map