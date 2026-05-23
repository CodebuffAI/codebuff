"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Web Vitals entrypoint (without attribution)
 *
 * This is the default, lighter bundle (~6KB) that captures core web vitals metrics
 * without attribution data. Attribution data includes debugging information like
 * which elements caused layout shifts, timing breakdowns, etc.
 *
 * We split this into two bundles because:
 * 1. Attribution code adds ~6KB to the bundle size
 * 2. Attribution can cause memory issues in SPAs (onCLS holds references to detached DOM elements)
 * 3. Most users only need aggregate metrics, not debugging attribution data
 *
 * For attribution data, use web-vitals-with-attribution.ts instead by setting:
 *   capture_performance: { web_vitals_attribution: true }
 *
 * @see web-vitals-with-attribution.ts
 */
var globals_1 = require("../utils/globals");
var web_vitals_1 = require("web-vitals");
var postHogWebVitalsCallbacks = {
    onLCP: web_vitals_1.onLCP,
    onCLS: web_vitals_1.onCLS,
    onFCP: web_vitals_1.onFCP,
    onINP: web_vitals_1.onINP,
};
globals_1.assignableWindow.__PosthogExtensions__ = globals_1.assignableWindow.__PosthogExtensions__ || {};
globals_1.assignableWindow.__PosthogExtensions__.postHogWebVitalsCallbacks = postHogWebVitalsCallbacks;
// we used to put posthogWebVitalsCallbacks on window, and now we put it on __PosthogExtensions__
// but that means that old clients which lazily load this extension are looking in the wrong place
// yuck,
// so we also put it directly on the window
// when 1.161.1 is the oldest version seen in production we can remove this
globals_1.assignableWindow.postHogWebVitalsCallbacks = postHogWebVitalsCallbacks;
// deprecated function kept for backwards compatibility
globals_1.assignableWindow.__PosthogExtensions__.loadWebVitalsCallbacks = function () { return postHogWebVitalsCallbacks; };
exports.default = postHogWebVitalsCallbacks;
//# sourceMappingURL=web-vitals.js.map