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
exports.ProductTourTooltip = ProductTourTooltip;
var jsx_runtime_1 = require("preact/jsx-runtime");
var hooks_1 = require("preact/hooks");
var core_1 = require("@posthog/core");
var product_tours_utils_1 = require("../product-tours-utils");
var surveys_extension_utils_1 = require("../../surveys/surveys-extension-utils");
var utils_1 = require("../../../utils");
var globals_1 = require("../../../utils/globals");
var ProductTourTooltipInner_1 = require("./ProductTourTooltipInner");
var ProductTourSurveyStepInner_1 = require("./ProductTourSurveyStepInner");
var window = globals_1.window;
function getOppositePosition(position) {
    var opposites = {
        top: 'bottom',
        bottom: 'top',
        left: 'right',
        right: 'left',
    };
    return opposites[position];
}
function scrollToElement(element, resolve) {
    var initialRect = element.getBoundingClientRect();
    var viewportHeight = window.innerHeight;
    var viewportWidth = window.innerWidth;
    var safeMarginY = viewportHeight / 6;
    var safeMarginX = viewportWidth / 6;
    var isInSafeZone = initialRect.top >= safeMarginY &&
        initialRect.bottom <= viewportHeight - safeMarginY &&
        initialRect.left >= safeMarginX &&
        initialRect.right <= viewportWidth - safeMarginX;
    if (isInSafeZone) {
        resolve();
        return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var lastTop = initialRect.top;
    var stableCount = 0;
    var resolved = false;
    var checkStability = function () {
        if (resolved)
            return;
        var currentRect = element.getBoundingClientRect();
        if (Math.abs(currentRect.top - lastTop) < 1) {
            stableCount++;
            if (stableCount >= 3) {
                resolved = true;
                resolve();
                return;
            }
        }
        else {
            stableCount = 0;
        }
        lastTop = currentRect.top;
        setTimeout(checkStability, 50);
    };
    setTimeout(checkStability, 30);
    setTimeout(function () {
        if (!resolved) {
            resolved = true;
            resolve();
        }
    }, 500);
}
var TRANSITION_DURATION = 150;
function ProductTourTooltip(_a) {
    var _b;
    var tour = _a.tour, step = _a.step, stepIndex = _a.stepIndex, totalSteps = _a.totalSteps, targetElement = _a.targetElement, onNext = _a.onNext, onPrevious = _a.onPrevious, onDismiss = _a.onDismiss, onSurveySubmit = _a.onSurveySubmit, onButtonClick = _a.onButtonClick;
    var _c = __read((0, hooks_1.useState)('entering'), 2), transitionState = _c[0], setTransitionState = _c[1];
    var _d = __read((0, hooks_1.useState)(null), 2), position = _d[0], setPosition = _d[1];
    var _e = __read((0, hooks_1.useState)(null), 2), spotlightStyle = _e[0], setSpotlightStyle = _e[1];
    var _f = __read((0, hooks_1.useState)(false), 2), isMeasured = _f[0], setIsMeasured = _f[1];
    var _g = __read((0, hooks_1.useState)(step), 2), displayedStep = _g[0], setDisplayedStep = _g[1];
    var _h = __read((0, hooks_1.useState)(stepIndex), 2), displayedStepIndex = _h[0], setDisplayedStepIndex = _h[1];
    var tooltipRef = (0, hooks_1.useRef)(null);
    var previousStepRef = (0, hooks_1.useRef)(stepIndex);
    var isTransitioningRef = (0, hooks_1.useRef)(false);
    var resolvedElementRef = (0, hooks_1.useRef)(targetElement);
    // Steps without element targeting use screen positioning
    var isScreenPositioned = !(0, product_tours_utils_1.hasElementTarget)(displayedStep) || displayedStep.type === 'survey';
    (0, hooks_1.useLayoutEffect)(function () {
        resolvedElementRef.current = targetElement;
    }, [targetElement]);
    var updatePosition = (0, hooks_1.useCallback)(function () {
        var element = resolvedElementRef.current;
        if (!element || !tooltipRef.current)
            return;
        var tooltipRect = tooltipRef.current.getBoundingClientRect();
        var tooltipDimensions = {
            width: tooltipRect.width,
            height: tooltipRect.height,
        };
        var targetRect = element.getBoundingClientRect();
        setPosition((0, product_tours_utils_1.calculateTooltipPosition)(targetRect, tooltipDimensions));
        setSpotlightStyle((0, product_tours_utils_1.getSpotlightStyle)(targetRect));
        setIsMeasured(true);
    }, []);
    (0, hooks_1.useLayoutEffect)(function () {
        if (!isScreenPositioned && !isMeasured && tooltipRef.current && targetElement) {
            updatePosition();
        }
    }, [isScreenPositioned, isMeasured, targetElement, updatePosition]);
    (0, hooks_1.useEffect)(function () {
        var currentStepIndex = stepIndex;
        var isStepChange = previousStepRef.current !== stepIndex;
        var finishEntering = function () {
            if (previousStepRef.current !== currentStepIndex)
                return;
            setTransitionState('visible');
            isTransitioningRef.current = false;
        };
        var enterStep = function () {
            // Only scroll/position for steps with element targeting
            if (resolvedElementRef.current && (0, product_tours_utils_1.hasElementTarget)(step)) {
                if (!resolvedElementRef.current.isConnected) {
                    resolvedElementRef.current = (0, product_tours_utils_1.findStepElement)(step).element;
                }
                if (resolvedElementRef.current) {
                    scrollToElement(resolvedElementRef.current, function () {
                        if (previousStepRef.current !== currentStepIndex)
                            return;
                        updatePosition();
                        setTimeout(finishEntering, 50);
                    });
                    return;
                }
            }
            setTimeout(finishEntering, 50);
        };
        if (!isStepChange) {
            previousStepRef.current = stepIndex;
            isTransitioningRef.current = true;
            enterStep();
            return;
        }
        previousStepRef.current = stepIndex;
        isTransitioningRef.current = true;
        setTransitionState('exiting');
        setTimeout(function () {
            if (previousStepRef.current !== currentStepIndex)
                return;
            // Reset position for element-targeted steps to prevent flash at old position
            if ((0, product_tours_utils_1.hasElementTarget)(step)) {
                setPosition(null);
                setSpotlightStyle(null);
                setIsMeasured(false);
            }
            setDisplayedStep(step);
            setDisplayedStepIndex(stepIndex);
            setTransitionState('entering');
            enterStep();
        }, TRANSITION_DURATION);
    }, [targetElement, stepIndex, step, updatePosition]);
    (0, hooks_1.useEffect)(function () {
        if (transitionState !== 'visible' || isScreenPositioned)
            return;
        var handleUpdate = function () {
            if (!isTransitioningRef.current) {
                updatePosition();
            }
        };
        (0, utils_1.addEventListener)(window, 'scroll', handleUpdate, { capture: true });
        (0, utils_1.addEventListener)(window, 'resize', handleUpdate);
        return function () {
            window === null || window === void 0 ? void 0 : window.removeEventListener('scroll', handleUpdate, true);
            window === null || window === void 0 ? void 0 : window.removeEventListener('resize', handleUpdate);
        };
    }, [updatePosition, transitionState, isScreenPositioned]);
    (0, hooks_1.useEffect)(function () {
        var handleKeyDown = function (e) {
            if (e.key === 'Escape') {
                onDismiss('escape_key');
            }
        };
        (0, utils_1.addEventListener)(window, 'keydown', handleKeyDown);
        return function () {
            window === null || window === void 0 ? void 0 : window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onDismiss]);
    var handleOverlayClick = function (e) {
        e.stopPropagation();
        onDismiss('user_clicked_outside');
    };
    var handleTooltipClick = function (e) {
        e.stopPropagation();
    };
    var handleSpotlightClick = function (e) {
        e.stopPropagation();
        if (resolvedElementRef.current) {
            resolvedElementRef.current.click();
        }
        onNext();
    };
    var isVisible = transitionState === 'visible';
    var isSurvey = displayedStep.type === 'survey';
    // For element steps, position is ready once we've measured and calculated
    var isPositionReady = isScreenPositioned || isMeasured;
    var basePosition = { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto', transform: 'none' };
    // surveys default to bottom: 0, and PT should not, so this is a little clunky
    var getModalPosition = function () {
        var _a;
        var pos = (0, surveys_extension_utils_1.getPopoverPosition)(undefined, (_a = displayedStep.modalPosition) !== null && _a !== void 0 ? _a : core_1.SurveyPosition.MiddleCenter);
        if (!('top' in pos) && !('bottom' in pos)) {
            return __assign(__assign({}, pos), { bottom: '30px' });
        }
        return pos;
    };
    var getElementPositionStyle = function () {
        if (!position) {
            return {};
        }
        var isHorizontal = position.position === 'left' || position.position === 'right';
        return {
            top: !(0, core_1.isUndefined)(position.top) ? "".concat(position.top, "px") : 'auto',
            bottom: !(0, core_1.isUndefined)(position.bottom) ? "".concat(position.bottom, "px") : 'auto',
            left: !(0, core_1.isUndefined)(position.left) ? "".concat(position.left, "px") : 'auto',
            right: !(0, core_1.isUndefined)(position.right) ? "".concat(position.right, "px") : 'auto',
            transform: isHorizontal ? 'translateY(-50%)' : 'translateX(-50%)',
        };
    };
    var tooltipStyle = __assign(__assign({}, (displayedStep.maxWidth && {
        width: "min(".concat(displayedStep.maxWidth, "px, calc(100vw - 16px))"),
        maxWidth: "min(".concat(displayedStep.maxWidth, "px, calc(100vw - 16px))"),
    })), (isScreenPositioned
        ? __assign(__assign({}, basePosition), getModalPosition()) : getElementPositionStyle()));
    return ((0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-container", children: [((_b = tour.appearance) === null || _b === void 0 ? void 0 : _b.dismissOnClickOutside) !== false && ((0, jsx_runtime_1.jsx)("div", { class: "ph-tour-click-overlay", onClick: handleOverlayClick })), (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-modal-overlay", style: {
                    opacity: isScreenPositioned && isVisible ? 1 : 0,
                    transition: "opacity ".concat(TRANSITION_DURATION, "ms ease-out"),
                    pointerEvents: 'none',
                } }), (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-spotlight", style: __assign(__assign(__assign({}, (isVisible && isPositionReady && spotlightStyle
                    ? spotlightStyle
                    : { top: '50%', left: '50%', width: '0px', height: '0px' })), { opacity: !isScreenPositioned && isVisible && isPositionReady ? 1 : 0, transition: "opacity ".concat(TRANSITION_DURATION, "ms ease-out") }), (displayedStep.progressionTrigger === 'click' &&
                    !isScreenPositioned && {
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                })), onClick: displayedStep.progressionTrigger === 'click' && !isScreenPositioned
                    ? handleSpotlightClick
                    : undefined }), (0, jsx_runtime_1.jsxs)("div", { ref: tooltipRef, class: "ph-tour-tooltip ".concat(isScreenPositioned ? 'ph-tour-tooltip--modal' : '', " ").concat(isSurvey ? 'ph-tour-survey-step' : ''), style: __assign(__assign({}, tooltipStyle), { opacity: isVisible && isPositionReady ? 1 : 0, transition: "opacity ".concat(TRANSITION_DURATION, "ms ease-out") }), onClick: handleTooltipClick, children: [!isScreenPositioned && position && ((0, jsx_runtime_1.jsx)("div", { class: "ph-tour-arrow ph-tour-arrow--".concat(getOppositePosition(position.position)), style: position.arrowOffset !== 0
                            ? { '--ph-tour-arrow-offset': "".concat(position.arrowOffset, "px") }
                            : undefined })), isSurvey ? ((0, jsx_runtime_1.jsx)(ProductTourSurveyStepInner_1.ProductTourSurveyStepInner, { step: displayedStep, appearance: tour.appearance, stepIndex: displayedStepIndex, totalSteps: totalSteps, onSubmit: onSurveySubmit, onPrevious: onPrevious, onDismiss: function () { return onDismiss('user_clicked_skip'); } })) : ((0, jsx_runtime_1.jsx)(ProductTourTooltipInner_1.ProductTourTooltipInner, { step: displayedStep, appearance: tour.appearance, stepIndex: displayedStepIndex, totalSteps: totalSteps, onNext: onNext, onPrevious: onPrevious, onDismiss: function () { return onDismiss('user_clicked_skip'); }, onButtonClick: onButtonClick }))] })] }));
}
//# sourceMappingURL=ProductTourTooltip.js.map