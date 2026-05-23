"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductTourTooltipInner = ProductTourTooltipInner;
var jsx_runtime_1 = require("preact/jsx-runtime");
var product_tours_utils_1 = require("../product-tours-utils");
var icons_1 = require("../../surveys/icons");
function TourButton(_a) {
    var button = _a.button, variant = _a.variant, onClick = _a.onClick, cursorStyle = _a.cursorStyle;
    var className = "ph-tour-button ph-tour-button--".concat(variant);
    if (button.action === 'link' && button.link) {
        return ((0, jsx_runtime_1.jsx)("a", { href: button.link, target: "_blank", rel: "noopener noreferrer", class: className, onClick: function () { return onClick(button); }, children: button.text }));
    }
    return ((0, jsx_runtime_1.jsx)("button", { class: className, onClick: function () { return onClick(button); }, style: cursorStyle, children: button.text }));
}
function ProductTourTooltipInner(_a) {
    var _b, _c, _d;
    var step = _a.step, appearance = _a.appearance, stepIndex = _a.stepIndex, totalSteps = _a.totalSteps, onNext = _a.onNext, onPrevious = _a.onPrevious, onDismiss = _a.onDismiss, onButtonClick = _a.onButtonClick;
    var whiteLabel = (_b = appearance === null || appearance === void 0 ? void 0 : appearance.whiteLabel) !== null && _b !== void 0 ? _b : false;
    var isLastStep = stepIndex >= totalSteps - 1;
    var isFirstStep = stepIndex === 0;
    var showDefaultButtons = !step.buttons && (step.progressionTrigger === 'button' || !(0, product_tours_utils_1.hasElementTarget)(step));
    var hasCustomButtons = !!step.buttons;
    var isInteractive = !!(onNext || onPrevious || onDismiss || onButtonClick);
    var cursorStyle = isInteractive ? undefined : { cursor: 'default' };
    var showPostHogBranding = !whiteLabel && isFirstStep;
    var handleButtonClick = function (button) {
        if (onButtonClick) {
            onButtonClick(button);
        }
    };
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("button", { class: "ph-tour-dismiss", onClick: onDismiss, "aria-label": "Close tour", style: cursorStyle, children: (0, icons_1.cancelSVG)() }), (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-content", dangerouslySetInnerHTML: { __html: (0, product_tours_utils_1.getStepHtml)(step) } }), (0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-footer", children: [totalSteps > 1 && ((0, jsx_runtime_1.jsxs)("span", { class: "ph-tour-progress", children: [stepIndex + 1, " of ", totalSteps] })), (0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-buttons", children: [showDefaultButtons && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [!isFirstStep && ((0, jsx_runtime_1.jsx)("button", { class: "ph-tour-button ph-tour-button--secondary", onClick: onPrevious, style: cursorStyle, children: "Back" })), (0, jsx_runtime_1.jsx)("button", { class: "ph-tour-button ph-tour-button--primary", onClick: onNext, style: cursorStyle, children: isLastStep ? 'Done' : 'Next' })] })), hasCustomButtons && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [((_c = step.buttons) === null || _c === void 0 ? void 0 : _c.secondary) && ((0, jsx_runtime_1.jsx)(TourButton, { button: step.buttons.secondary, variant: "secondary", onClick: handleButtonClick, cursorStyle: cursorStyle })), ((_d = step.buttons) === null || _d === void 0 ? void 0 : _d.primary) && ((0, jsx_runtime_1.jsx)(TourButton, { button: step.buttons.primary, variant: "primary", onClick: handleButtonClick, cursorStyle: cursorStyle }))] }))] })] }), showPostHogBranding && ((0, jsx_runtime_1.jsxs)("a", { href: isInteractive ? 'https://posthog.com/docs/product-tours' : undefined, target: isInteractive ? '_blank' : undefined, rel: isInteractive ? 'noopener noreferrer' : undefined, class: "ph-tour-branding", style: isInteractive ? undefined : { cursor: 'default', pointerEvents: 'none' }, children: ["Tour by ", icons_1.IconPosthogLogo] }))] }));
}
//# sourceMappingURL=ProductTourTooltipInner.js.map