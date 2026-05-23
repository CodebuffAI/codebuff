"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Web Vitals entrypoint (with attribution)
 *
 * This bundle includes attribution data which provides additional debugging information:
 * - Which elements caused layout shifts (CLS)
 * - Timing breakdowns for LCP
 * - Interaction targets for INP
 *
 * This bundle is ~12KB (vs ~6KB for the non-attribution version).
 *
 * Note: Attribution can cause memory issues in SPAs because the onCLS callback
 * holds references to DOM elements that may be detached during navigation.
 * Only enable if you need the debugging data.
 *
 * Enable via: capture_performance: { web_vitals_attribution: true }
 *
 * @see web-vitals.ts for the lighter, default bundle
 */
var globals_1 = require("../utils/globals");
var attribution_1 = require("web-vitals/attribution");
var postHogWebVitalsCallbacks = {
    onLCP: attribution_1.onLCP,
    onCLS: attribution_1.onCLS,
    onFCP: attribution_1.onFCP,
    onINP: attribution_1.onINP,
};
globals_1.assignableWindow.__PosthogExtensions__ = globals_1.assignableWindow.__PosthogExtensions__ || {};
globals_1.assignableWindow.__PosthogExtensions__.postHogWebVitalsCallbacks = postHogWebVitalsCallbacks;
// we used to put posthogWebVitalsCallbacks on window, and now we put it on __PosthogExtensions__
// but that means that old clients which lazily load this extension are looking in the wrong place
// yuck,
// so we also put it directly on the window
// when 1.161.1 is the oldest version seen in production we can remove this
globals_1.assignableWindow.postHogWebVitalsCallbacks = postHogWebVitalsCallbacks;
exports.default = postHogWebVitalsCallbacks;
//# sourceMappingURL=web-vitals-with-attribution.js.map