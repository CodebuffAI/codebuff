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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductTourStylesheet = getProductTourStylesheet;
exports.hasElementTarget = hasElementTarget;
exports.findElementBySelector = findElementBySelector;
exports.findStepElement = findStepElement;
exports.isElementVisible = isElementVisible;
exports.getElementMetadata = getElementMetadata;
exports.calculateTooltipPosition = calculateTooltipPosition;
exports.getSpotlightStyle = getSpotlightStyle;
exports.addProductTourCSSVariablesToElement = addProductTourCSSVariablesToElement;
exports.renderTipTapContent = renderTipTapContent;
exports.normalizeUrl = normalizeUrl;
exports.resolveStepTranslation = resolveStepTranslation;
exports.getStepImageUrls = getStepImageUrls;
exports.getStepHtml = getStepHtml;
exports.hasTourWaitPeriodPassed = hasTourWaitPeriodPassed;
var dompurify_1 = __importDefault(require("dompurify"));
var posthog_product_tours_types_1 = require("../../posthog-product-tours-types");
var element_inference_1 = require("./element-inference");
var stylesheet_loader_1 = require("../utils/stylesheet-loader");
var globals_1 = require("../../utils/globals");
var surveys_extension_utils_1 = require("../surveys/surveys-extension-utils");
var logger_1 = require("../../utils/logger");
var storage_1 = require("../../storage");
var constants_1 = require("./constants");
var product_tour_css_1 = __importDefault(require("./product-tour.css"));
var core_1 = require("@posthog/core");
var matcher_utils_1 = require("../utils/matcher-utils");
var logger = (0, logger_1.createLogger)('[Product Tours]');
var document = globals_1.document;
var window = globals_1.window;
function getProductTourStylesheet() {
    var stylesheet = (0, stylesheet_loader_1.prepareStylesheet)(document, typeof product_tour_css_1.default === 'string' ? product_tour_css_1.default : '');
    stylesheet === null || stylesheet === void 0 ? void 0 : stylesheet.setAttribute('data-ph-product-tour-style', 'true');
    return stylesheet;
}
function hasElementTarget(step) {
    if (step.useManualSelector) {
        return !!step.selector;
    }
    return !!step.inferenceData;
}
function findElementBySelector(selector) {
    try {
        var elements = document.querySelectorAll(selector);
        if (elements.length === 0) {
            return { element: null, error: 'not_found', matchCount: 0 };
        }
        var element = elements[0];
        if (!isElementVisible(element)) {
            return { element: null, error: 'not_visible', matchCount: elements.length };
        }
        if (elements.length > 1) {
            return { element: element, error: 'multiple_matches', matchCount: elements.length };
        }
        return { element: element, error: null, matchCount: 1 };
    }
    catch (_a) {
        return { element: null, error: 'not_found', matchCount: 0 };
    }
}
/**
 * Find element for a step based on its lookup mode.
 * Default: use inference. If useManualSelector is true: use CSS selector.
 */
function findStepElement(step) {
    var _a;
    var useManualSelector = (_a = step.useManualSelector) !== null && _a !== void 0 ? _a : false;
    if (useManualSelector) {
        if (!step.selector) {
            return { element: null, error: 'not_found', matchCount: 0 };
        }
        return findElementBySelector(step.selector);
    }
    if (!step.inferenceData) {
        return { element: null, error: 'not_found', matchCount: 0 };
    }
    var element = (0, element_inference_1.findElement)(step.inferenceData);
    return element ? { element: element, error: null, matchCount: 1 } : { element: null, error: 'not_found', matchCount: 0 };
}
function isElementVisible(element) {
    var style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    var rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }
    return true;
}
function getElementMetadata(element) {
    var _a;
    return {
        tag: element.tagName,
        id: element.id || undefined,
        classes: element.className || undefined,
        text: ((_a = element.innerText) === null || _a === void 0 ? void 0 : _a.slice(0, 100)) || undefined,
    };
}
var TOOLTIP_MARGIN = 12;
var VIEWPORT_PADDING = 8;
function clampToViewport(value, dimension, viewportDimension) {
    var min = VIEWPORT_PADDING + dimension / 2;
    var max = viewportDimension - VIEWPORT_PADDING - dimension / 2;
    var clamped = Math.max(min, Math.min(max, value));
    return { clamped: clamped, offset: value - clamped };
}
function calculateTooltipPosition(targetRect, tooltipDimensions) {
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var width = tooltipDimensions.width, height = tooltipDimensions.height;
    var spaceAbove = targetRect.top;
    var spaceBelow = viewportHeight - targetRect.bottom;
    var spaceLeft = targetRect.left;
    var spaceRight = viewportWidth - targetRect.right;
    var targetCenterY = targetRect.top + targetRect.height / 2;
    var targetCenterX = targetRect.left + targetRect.width / 2;
    if (spaceRight >= width + TOOLTIP_MARGIN) {
        // right of element
        var left_1 = targetRect.right + TOOLTIP_MARGIN;
        var _a = clampToViewport(targetCenterY, height, viewportHeight), top_1 = _a.clamped, arrowOffset_1 = _a.offset;
        return { position: 'right', top: top_1, left: left_1, arrowOffset: arrowOffset_1 };
    }
    if (spaceLeft >= width + TOOLTIP_MARGIN) {
        // left of element
        var right = viewportWidth - targetRect.left + TOOLTIP_MARGIN;
        var _b = clampToViewport(targetCenterY, height, viewportHeight), top_2 = _b.clamped, arrowOffset_2 = _b.offset;
        return { position: 'left', top: top_2, right: right, arrowOffset: arrowOffset_2 };
    }
    if (spaceAbove >= height + TOOLTIP_MARGIN && spaceBelow < height + TOOLTIP_MARGIN) {
        // above element
        var bottom = viewportHeight - targetRect.top + TOOLTIP_MARGIN;
        var _c = clampToViewport(targetCenterX, width, viewportWidth), left_2 = _c.clamped, arrowOffset_3 = _c.offset;
        return { position: 'top', bottom: bottom, left: left_2, arrowOffset: arrowOffset_3 };
    }
    // default: below element
    var top = targetRect.bottom + TOOLTIP_MARGIN;
    var _d = clampToViewport(targetCenterX, width, viewportWidth), left = _d.clamped, arrowOffset = _d.offset;
    return { position: 'bottom', top: top, left: left, arrowOffset: arrowOffset };
}
function getSpotlightStyle(targetRect, padding) {
    if (padding === void 0) { padding = 8; }
    return {
        top: "".concat(targetRect.top - padding, "px"),
        left: "".concat(targetRect.left - padding, "px"),
        width: "".concat(targetRect.width + padding * 2, "px"),
        height: "".concat(targetRect.height + padding * 2, "px"),
    };
}
function addProductTourCSSVariablesToElement(element, appearance) {
    var merged = __assign(__assign({}, posthog_product_tours_types_1.DEFAULT_PRODUCT_TOUR_APPEARANCE), appearance);
    var style = element.style;
    // User-customizable variables
    style.setProperty('--ph-tour-background-color', merged.backgroundColor);
    style.setProperty('--ph-tour-text-color', merged.textColor);
    style.setProperty('--ph-tour-button-color', merged.buttonColor);
    style.setProperty('--ph-tour-border-radius', "".concat(merged.borderRadius, "px"));
    style.setProperty('--ph-tour-button-border-radius', "".concat(merged.buttonBorderRadius, "px"));
    style.setProperty('--ph-tour-border-color', merged.borderColor);
    style.setProperty('--ph-tour-font-family', (0, surveys_extension_utils_1.getFontFamily)(merged.fontFamily));
    // Derived colors
    style.setProperty('--ph-tour-text-secondary-color', (0, surveys_extension_utils_1.hexToRgba)(merged.textColor, 0.6));
    style.setProperty('--ph-tour-branding-text-color', (0, surveys_extension_utils_1.getContrastingTextColor)(merged.backgroundColor));
    style.setProperty('--ph-tour-button-text-color', (0, surveys_extension_utils_1.getContrastingTextColor)(merged.buttonColor));
    style.setProperty('--ph-tour-box-shadow', merged.boxShadow);
    style.setProperty('--ph-tour-overlay-color', merged.showOverlay ? 'rgba(0, 0, 0, 0.5)' : 'transparent');
    style.setProperty('--ph-tour-z-index', String(merged.zIndex));
    // Internal styling variables (not customizable)
    style.setProperty('--ph-tour-button-secondary-color', 'transparent');
    style.setProperty('--ph-tour-button-secondary-text-color', merged.textColor);
    style.setProperty('--ph-tour-max-width', '320px');
    style.setProperty('--ph-tour-padding', '16px');
}
function renderTipTapContent(content) {
    var e_1, _a;
    var _b, _c;
    if (!content) {
        return '';
    }
    if (typeof content === 'string') {
        return escapeHtml(content);
    }
    if (content.type === 'text') {
        var text = escapeHtml(content.text || '');
        if (content.marks) {
            try {
                for (var _d = __values(content.marks), _e = _d.next(); !_e.done; _e = _d.next()) {
                    var mark = _e.value;
                    switch (mark.type) {
                        case 'bold':
                            text = "<strong>".concat(text, "</strong>");
                            break;
                        case 'italic':
                            text = "<em>".concat(text, "</em>");
                            break;
                        case 'underline':
                            text = "<u>".concat(text, "</u>");
                            break;
                        case 'strike':
                            text = "<s>".concat(text, "</s>");
                            break;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_e && !_e.done && (_a = _d.return)) _a.call(_d);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        return text;
    }
    var children = ((_b = content.content) === null || _b === void 0 ? void 0 : _b.map(renderTipTapContent).join('')) || '';
    switch (content.type) {
        case 'doc':
            return children;
        case 'paragraph':
            return "<p>".concat(children, "</p>");
        case 'heading': {
            var level = ((_c = content.attrs) === null || _c === void 0 ? void 0 : _c.level) || 1;
            return "<h".concat(level, ">").concat(children, "</h").concat(level, ">");
        }
        case 'bulletList':
            return "<ul>".concat(children, "</ul>");
        case 'orderedList':
            return "<ol>".concat(children, "</ol>");
        case 'listItem':
            return "<li>".concat(children, "</li>");
        case 'hardBreak':
            return '<br>';
        default:
            return children;
    }
}
function normalizeUrl(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function resolveStepTranslation(step, lang) {
    var _a;
    if (!lang || !step.translations) {
        return step;
    }
    var translations = step.translations;
    // exact match (en-US === en-US), then base match (en-US falls back to en)
    var t = (_a = translations[lang]) !== null && _a !== void 0 ? _a : translations[lang.split('-')[0]];
    if (!t) {
        logger.info("No matching translation for \"".concat(lang, "\" in step ").concat(step.id, ", using default"));
        return step;
    }
    var resolved = __assign({}, step);
    if (!(0, core_1.isUndefined)(t.content)) {
        resolved.content = t.content;
    }
    if (!(0, core_1.isUndefined)(t.contentHtml)) {
        resolved.contentHtml = t.contentHtml;
    }
    if (t.buttons && resolved.buttons) {
        resolved.buttons = {
            primary: resolved.buttons.primary && __assign(__assign({}, resolved.buttons.primary), t.buttons.primary),
            secondary: resolved.buttons.secondary && __assign(__assign({}, resolved.buttons.secondary), t.buttons.secondary),
        };
    }
    if (t.survey && resolved.survey) {
        resolved.survey = __assign(__assign({}, resolved.survey), t.survey);
    }
    return resolved;
}
function getStepImageUrls(step) {
    var urls = [];
    function walk(node) {
        var _a, _b;
        if (node.type === 'image' && ((_a = node.attrs) === null || _a === void 0 ? void 0 : _a.src)) {
            urls.push(node.attrs.src);
        }
        (_b = node.content) === null || _b === void 0 ? void 0 : _b.forEach(walk);
    }
    if (step.content) {
        walk(step.content);
    }
    return urls;
}
function getStepHtml(step) {
    if (step.contentHtml) {
        return dompurify_1.default.sanitize(step.contentHtml, {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allowfullscreen', 'frameborder', 'referrerpolicy'],
        });
    }
    // backwards compat, will be deprecated
    return renderTipTapContent(step.content);
}
function hasTourWaitPeriodPassed(seenTourWaitPeriod) {
    var e_2, _a;
    if (!seenTourWaitPeriod) {
        return true;
    }
    var days = seenTourWaitPeriod.days, types = seenTourWaitPeriod.types;
    if (!days || !types || types.length === 0) {
        return true;
    }
    var mostRecentDate = null;
    try {
        for (var types_1 = __values(types), types_1_1 = types_1.next(); !types_1_1.done; types_1_1 = types_1.next()) {
            var type = types_1_1.value;
            var raw = storage_1.localStore._get("".concat(constants_1.LAST_SEEN_TOUR_DATE_KEY_PREFIX).concat(type));
            if (raw) {
                try {
                    var stored = JSON.parse(raw);
                    var date = new Date(stored);
                    if (!isNaN(date.getTime()) && (!mostRecentDate || date > mostRecentDate)) {
                        mostRecentDate = date;
                    }
                }
                catch (_b) {
                    // ignore malformed entries
                }
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (types_1_1 && !types_1_1.done && (_a = types_1.return)) _a.call(types_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    if (!mostRecentDate) {
        return true;
    }
    return (0, matcher_utils_1.hasPeriodPassed)(days, mostRecentDate);
}
//# sourceMappingURL=product-tours-utils.js.map