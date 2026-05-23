"use strict";
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.elementIsVisible = elementIsVisible;
exports.findElement = findElement;
exports.getElementPath = getElementPath;
var query_selector_shadow_dom_1 = require("query-selector-shadow-dom");
var globals_1 = require("../../utils/globals");
var core_1 = require("@posthog/core");
var window = globals_1.window;
var logger = (0, core_1.createLogger)('[Element Inference]');
// this is copied directly from the main repo: /frontend/src/toolbar/utils.ts
// TODO: once this is deployed, we can have the main repo reference this instead
function elementIsVisible(element, cache) {
    try {
        var alreadyCached = cache.get(element);
        if (!(0, core_1.isUndefined)(alreadyCached)) {
            return alreadyCached;
        }
        if (element.checkVisibility) {
            var nativeIsVisible = element.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
            });
            cache.set(element, nativeIsVisible);
            return nativeIsVisible;
        }
        var style = window.getComputedStyle(element);
        var isInvisible = style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0;
        if (isInvisible) {
            cache.set(element, false);
            return false;
        }
        // Check parent chain for display/visibility
        var parent_1 = element.parentElement;
        while (parent_1) {
            // Check cache first
            var cached = cache.get(parent_1);
            if (!(0, core_1.isUndefined)(cached)) {
                if (!cached) {
                    return false;
                }
                // If cached as visible, skip to next parent
                parent_1 = parent_1.parentElement;
                continue;
            }
            var parentStyle = window.getComputedStyle(parent_1);
            var parentVisible = parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden';
            cache.set(parent_1, parentVisible);
            if (!parentVisible) {
                return false;
            }
            parent_1 = parent_1.parentElement;
        }
        // Check if element has actual rendered dimensions
        var rect = element.getBoundingClientRect();
        var elementHasActualRenderedDimensions = rect.width > 0 ||
            rect.height > 0 ||
            // Some elements might be 0x0 but still visible (e.g., inline elements with content)
            element.getClientRects().length > 0;
        cache.set(element, elementHasActualRenderedDimensions);
        return elementHasActualRenderedDimensions;
    }
    catch (_a) {
        // if we can't get the computed style, we'll assume the element is visible
        return true;
    }
}
function getElementText(element) {
    var _a;
    var text = (_a = element.innerText) === null || _a === void 0 ? void 0 : _a.trim();
    // anything higher than 250 chars -> prob not a good selector / button / target
    if (!text || text.length > 250) {
        return null;
    }
    return text;
}
function elementMatchesText(element, text) {
    var elementText = getElementText(element);
    return (elementText === null || elementText === void 0 ? void 0 : elementText.toLowerCase()) === text.toLowerCase();
}
// generator to query elements, filtering by text and visibility
function queryElements(selector, text, visibilityCache) {
    var elements, elements_1, elements_1_1, el, element, e_1_1;
    var e_1, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                try {
                    elements = (0, query_selector_shadow_dom_1.querySelectorAllDeep)(selector);
                }
                catch (_c) {
                    return [2 /*return*/];
                }
                _b.label = 1;
            case 1:
                _b.trys.push([1, 6, 7, 8]);
                elements_1 = __values(elements), elements_1_1 = elements_1.next();
                _b.label = 2;
            case 2:
                if (!!elements_1_1.done) return [3 /*break*/, 5];
                el = elements_1_1.value;
                element = el;
                if (text && !elementMatchesText(element, text)) {
                    return [3 /*break*/, 4];
                }
                if (!elementIsVisible(element, visibilityCache)) {
                    return [3 /*break*/, 4];
                }
                return [4 /*yield*/, element];
            case 3:
                _b.sent();
                _b.label = 4;
            case 4:
                elements_1_1 = elements_1.next();
                return [3 /*break*/, 2];
            case 5: return [3 /*break*/, 8];
            case 6:
                e_1_1 = _b.sent();
                e_1 = { error: e_1_1 };
                return [3 /*break*/, 8];
            case 7:
                try {
                    if (elements_1_1 && !elements_1_1.done && (_a = elements_1.return)) _a.call(elements_1);
                }
                finally { if (e_1) throw e_1.error; }
                return [7 /*endfinally*/];
            case 8: return [2 /*return*/];
        }
    });
}
// could be inlined, but wanna keep lazy eval from queryElements
function nth(iterable, n) {
    var e_2, _a;
    var idx = 0;
    try {
        for (var iterable_1 = __values(iterable), iterable_1_1 = iterable_1.next(); !iterable_1_1.done; iterable_1_1 = iterable_1.next()) {
            var item = iterable_1_1.value;
            if (idx === n) {
                return item;
            }
            idx++;
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (iterable_1_1 && !iterable_1_1.done && (_a = iterable_1.return)) _a.call(iterable_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return null;
}
/**
 * if inferSelector is the sauce, this is the nugget
 *
 * find an element in the dom using the element inference data
 *
 * 1. try each group of selectors, starting with most specific (lowest cardinality)
 * 2. try each selector in the group - run the css query, go to offset
 * 3. "vote" for the element if it was found
 * 4. return early if any element gets majority votes
 * 5. return element w/ most votes
 */
function findElement(selector) {
    var e_3, _a;
    var _b;
    try {
        var autoData = JSON.parse(selector.autoData);
        if (!(0, core_1.isArray)(autoData === null || autoData === void 0 ? void 0 : autoData.textGroups) || !(0, core_1.isArray)(autoData === null || autoData === void 0 ? void 0 : autoData.notextGroups)) {
            logger.error('Invalid autoData structure:', autoData);
            return null;
        }
        var text = selector.text, excludeText = selector.excludeText, _c = selector.precision, precision = _c === void 0 ? 1 : _c;
        // excludeText -> user setting, usually if the target element
        // has dynamic/localized text
        var useText = text != null && !excludeText;
        // choose appropriate group + sort
        var groups = (useText ? autoData.textGroups : autoData.notextGroups).sort(function (a, b) { return a.cardinality - b.cardinality; });
        if (groups.length === 0) {
            return null;
        }
        // precision controls how many groups to search
        // 1 = strict (only most specific group), 0 = loose (all groups)
        var maxGroups = Math.max(1, Math.ceil((1 - precision) * groups.length));
        var visibilityCache = new WeakMap();
        // try each selector group, starting w/ most specific (lowest cardinality)
        for (var i = 0; i < maxGroups; i++) {
            var group = groups[i];
            var votes = new Map();
            var winner = null;
            var maxVotes = 0;
            try {
                // test each selector in the group
                for (var _d = (e_3 = void 0, __values(group.cssSelectors)), _e = _d.next(); !_e.done; _e = _d.next()) {
                    var _f = _e.value, css = _f.css, offset = _f.offset;
                    // get matches, jump to offset to find our target
                    var element = nth(queryElements(css, useText ? text : null, visibilityCache), offset);
                    if (!element) {
                        continue;
                    }
                    // if we found something, this element gets a vote
                    var voteCount = ((_b = votes.get(element)) !== null && _b !== void 0 ? _b : 0) + 1;
                    votes.set(element, voteCount);
                    if (voteCount > maxVotes) {
                        maxVotes = voteCount;
                        winner = element;
                        // break early if we have a majority
                        if (voteCount >= Math.ceil(group.cssSelectors.length / 2)) {
                            return winner;
                        }
                    }
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (_e && !_e.done && (_a = _d.return)) _a.call(_d);
                }
                finally { if (e_3) throw e_3.error; }
            }
            if (winner) {
                return winner;
            }
        }
        return null;
    }
    catch (error) {
        logger.error('Error finding element:', error);
        return null;
    }
}
function getElementPath(el, depth) {
    if (depth === void 0) { depth = 4; }
    if (!el) {
        return null;
    }
    var parts = [];
    var current = el;
    while (current && parts.length < depth && current.tagName !== 'BODY') {
        var part = current.tagName.toLowerCase();
        if (current.id) {
            part += "#".concat(current.id);
        }
        else if (current.classList.length) {
            part += ".".concat(current.classList[0]);
        }
        parts.unshift(part);
        current = current.parentElement;
    }
    return parts.join(' > ');
}
//# sourceMappingURL=element-inference.js.map