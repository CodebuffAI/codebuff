"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostHogLogo = PostHogLogo;
var jsx_runtime_1 = require("preact/jsx-runtime");
var icons_1 = require("../icons");
function PostHogLogo(_a) {
    var urlParams = _a.urlParams;
    // Manual query string building for IE11/op_mini compatibility (no URLSearchParams)
    var queryString = urlParams
        ? Object.entries(urlParams)
            .map(function (_a) {
            var _b = __read(_a, 2), key = _b[0], value = _b[1];
            return "".concat(encodeURIComponent(key), "=").concat(encodeURIComponent(value));
        })
            .join('&')
        : '';
    return ((0, jsx_runtime_1.jsxs)("a", { href: "https://posthog.com/surveys".concat(queryString ? "?".concat(queryString) : ''), target: "_blank", rel: "noopener", className: "footer-branding", children: ["Survey by ", icons_1.IconPosthogLogo] }));
}
//# sourceMappingURL=PostHogLogo.js.map