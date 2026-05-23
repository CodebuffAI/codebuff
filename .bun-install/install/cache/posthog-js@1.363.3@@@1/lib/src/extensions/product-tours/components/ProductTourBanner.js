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
exports.ProductTourBanner = ProductTourBanner;
var jsx_runtime_1 = require("preact/jsx-runtime");
var product_tours_utils_1 = require("../product-tours-utils");
var icons_1 = require("../../surveys/icons");
function LinkWrapper(_a) {
    var className = _a.class, href = _a.href, onClick = _a.onClick, children = _a.children;
    return ((0, jsx_runtime_1.jsx)("a", { class: className, href: href, target: "_blank", rel: "noopener noreferrer", onClick: onClick, children: children }));
}
function ButtonWrapper(_a) {
    var className = _a.class, onClick = _a.onClick, children = _a.children;
    return ((0, jsx_runtime_1.jsx)("div", { class: className, role: "button", tabIndex: 0, onClick: onClick, onKeyDown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        }, style: { cursor: 'pointer' }, children: children }));
}
function StaticWrapper(_a) {
    var className = _a.class, children = _a.children;
    return (0, jsx_runtime_1.jsx)("div", { class: className, children: children });
}
function ProductTourBanner(props) {
    return ((0, jsx_runtime_1.jsx)("div", { class: "ph-tour-banner-wrapper", children: (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-banner-slide", children: (0, jsx_runtime_1.jsx)(ProductTourBannerInner, __assign({}, props)) }) }));
}
function ProductTourBannerInner(_a) {
    var _b;
    var step = _a.step, onDismiss = _a.onDismiss, onActionClick = _a.onActionClick, displayFrequency = _a.displayFrequency;
    var config = (_b = step.bannerConfig) !== null && _b !== void 0 ? _b : { behavior: 'sticky' };
    var action = config.action;
    // "always" display frequency means no dismiss button
    var showDismissButton = displayFrequency !== 'always';
    var classNames = [
        'ph-tour-banner',
        config.behavior === 'sticky' && 'ph-tour-banner--sticky',
        config.behavior === 'custom' && 'ph-tour-banner--custom',
    ]
        .filter(Boolean)
        .join(' ');
    var content = ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { class: "ph-tour-banner-content", dangerouslySetInnerHTML: { __html: (0, product_tours_utils_1.getStepHtml)(step) } }), showDismissButton && ((0, jsx_runtime_1.jsx)("button", { class: "ph-tour-banner-dismiss", onClick: function (e) {
                    e.stopPropagation();
                    e.preventDefault();
                    onDismiss();
                }, "aria-label": "Close banner", children: (0, icons_1.cancelSVG)() }))] }));
    if ((action === null || action === void 0 ? void 0 : action.type) === 'link' && action.link) {
        return ((0, jsx_runtime_1.jsx)(LinkWrapper, { class: classNames, href: action.link, onClick: onActionClick, children: content }));
    }
    if ((action === null || action === void 0 ? void 0 : action.type) === 'trigger_tour' && onActionClick) {
        return ((0, jsx_runtime_1.jsx)(ButtonWrapper, { class: classNames, onClick: onActionClick, children: content }));
    }
    return (0, jsx_runtime_1.jsx)(StaticWrapper, { class: classNames, children: content });
}
//# sourceMappingURL=ProductTourBanner.js.map