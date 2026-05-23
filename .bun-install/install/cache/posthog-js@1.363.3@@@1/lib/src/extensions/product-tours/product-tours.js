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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductTourManager = void 0;
var jsx_runtime_1 = require("preact/jsx-runtime");
var preact_1 = require("preact");
var posthog_product_tours_types_1 = require("../../posthog-product-tours-types");
var posthog_surveys_types_1 = require("../../posthog-surveys-types");
var product_tours_utils_1 = require("./product-tours-utils");
var ProductTourTooltip_1 = require("./components/ProductTourTooltip");
var ProductTourBanner_1 = require("./components/ProductTourBanner");
var logger_1 = require("../../utils/logger");
var globals_1 = require("../../utils/globals");
var storage_1 = require("../../storage");
var utils_1 = require("../../utils");
var core_1 = require("@posthog/core");
var property_utils_1 = require("../../utils/property-utils");
var constants_1 = require("./constants");
var product_tour_utils_1 = require("../../utils/product-tour-utils");
var constants_2 = require("../../constants");
var product_tour_event_receiver_1 = require("../../utils/product-tour-event-receiver");
var event_utils_1 = require("../../utils/event-utils");
var matcher_utils_1 = require("../utils/matcher-utils");
var logger = (0, logger_1.createLogger)('[Product Tours]');
var document = globals_1.document;
var window = globals_1.window;
// cache the last-checked URL to avoid unnecessary repeated checks on every tick
var _lastUrlMatchHref;
var _urlMatchCache = new Map(); // tour ID : match result
function doesTourUrlMatch(tour) {
    var _a;
    var conditions = tour.conditions;
    if (!(conditions === null || conditions === void 0 ? void 0 : conditions.url)) {
        return true;
    }
    var href = (_a = window === null || window === void 0 ? void 0 : window.location) === null || _a === void 0 ? void 0 : _a.href;
    if (!href) {
        return false;
    }
    if (href !== _lastUrlMatchHref) {
        _urlMatchCache.clear();
        _lastUrlMatchHref = href;
    }
    var cached = _urlMatchCache.get(tour.id);
    if (!(0, core_1.isUndefined)(cached)) {
        return cached;
    }
    var matchType = conditions.urlMatchType || core_1.SurveyMatchType.Icontains;
    var result;
    if (matchType === core_1.SurveyMatchType.Exact) {
        result = (0, product_tours_utils_1.normalizeUrl)(href) === (0, product_tours_utils_1.normalizeUrl)(conditions.url);
    }
    else {
        var targets = [conditions.url];
        result = property_utils_1.propertyComparisons[matchType](targets, [href]);
    }
    _urlMatchCache.set(tour.id, result);
    return result;
}
function isTourInDateRange(tour) {
    var now = new Date();
    if (tour.start_date) {
        var startDate = new Date(tour.start_date);
        if (now < startDate) {
            return false;
        }
    }
    if (tour.end_date) {
        var endDate = new Date(tour.end_date);
        if (now > endDate) {
            return false;
        }
    }
    return true;
}
function checkTourConditions(tour) {
    var _a;
    return isTourInDateRange(tour) && doesTourUrlMatch(tour) && (0, matcher_utils_1.doesDeviceTypeMatch)((_a = tour.conditions) === null || _a === void 0 ? void 0 : _a.deviceTypes);
}
var CONTAINER_CLASS = 'ph-product-tour-container';
var TRIGGER_LISTENER_ATTRIBUTE = 'data-ph-tour-trigger';
var CHECK_INTERVAL_MS = 1000;
function retrieveTourShadow(tour) {
    var containerClass = "".concat(CONTAINER_CLASS, "-").concat(tour.id);
    var existingDiv = document.querySelector(".".concat(containerClass));
    if (existingDiv && existingDiv.shadowRoot) {
        return {
            shadow: existingDiv.shadowRoot,
            isNewlyCreated: false,
        };
    }
    var div = document.createElement('div');
    div.className = containerClass;
    (0, product_tours_utils_1.addProductTourCSSVariablesToElement)(div, tour.appearance);
    var shadow = div.attachShadow({ mode: 'open' });
    var stylesheet = (0, product_tours_utils_1.getProductTourStylesheet)();
    if (stylesheet) {
        shadow.appendChild(stylesheet);
    }
    document.body.appendChild(div);
    return {
        shadow: shadow,
        isNewlyCreated: true,
    };
}
function retrieveBannerShadow(tour, bannerConfig) {
    var _a;
    var containerClass = "".concat(CONTAINER_CLASS, "-").concat(tour.id);
    var existingDiv = document.querySelector(".".concat(containerClass));
    if (existingDiv && existingDiv.shadowRoot) {
        return {
            shadow: existingDiv.shadowRoot,
            isNewlyCreated: false,
        };
    }
    var div = document.createElement('div');
    div.className = containerClass;
    (0, product_tours_utils_1.addProductTourCSSVariablesToElement)(div, tour.appearance);
    if (!(0, core_1.isUndefined)((_a = bannerConfig === null || bannerConfig === void 0 ? void 0 : bannerConfig.animation) === null || _a === void 0 ? void 0 : _a.duration)) {
        div.style.setProperty('--ph-tour-banner-animation-duration', "".concat(bannerConfig.animation.duration, "ms"));
    }
    var shadow = div.attachShadow({ mode: 'open' });
    var stylesheet = (0, product_tours_utils_1.getProductTourStylesheet)();
    if (stylesheet) {
        shadow.appendChild(stylesheet);
    }
    if ((bannerConfig === null || bannerConfig === void 0 ? void 0 : bannerConfig.behavior) === 'custom' && bannerConfig.selector) {
        var customContainer = document.querySelector(bannerConfig.selector);
        if (customContainer) {
            customContainer.appendChild(div);
        }
        else {
            logger.warn("Custom banner container not found: ".concat(bannerConfig.selector, ". Banner will not be displayed."));
            return null;
        }
    }
    else {
        document.body.insertBefore(div, document.body.firstChild);
    }
    return {
        shadow: shadow,
        isNewlyCreated: true,
    };
}
function removeTourFromDom(tourId) {
    var containerClass = "".concat(CONTAINER_CLASS, "-").concat(tourId);
    var container = document.querySelector(".".concat(containerClass));
    if (container === null || container === void 0 ? void 0 : container.shadowRoot) {
        (0, preact_1.render)(null, container.shadowRoot);
    }
    container === null || container === void 0 ? void 0 : container.remove();
}
var PRODUCT_TOUR_TARGETING_FLAG_PREFIX = 'product-tour-targeting-';
var ProductTourManager = /** @class */ (function () {
    function ProductTourManager(instance) {
        var _this = this;
        this._activeTour = null;
        this._currentStepIndex = 0;
        this._isPreviewMode = false;
        this._isResuming = false;
        this._checkInterval = null;
        this._triggerSelectorListeners = new Map();
        this._pendingTourTimeouts = new Map();
        this._registeredEventTourIds = new Set();
        this._preloadedImageUrls = new Set();
        this._handleVisibilityChange = function () {
            if (document.hidden && _this._checkInterval) {
                clearInterval(_this._checkInterval);
                _this._checkInterval = null;
            }
            else if (!document.hidden && !_this._checkInterval) {
                _this._checkInterval = setInterval(function () {
                    _this._evaluateAndDisplayTours();
                }, CHECK_INTERVAL_MS);
                _this._evaluateAndDisplayTours();
            }
        };
        this.nextStep = function () {
            var _a;
            if (!_this._activeTour) {
                return;
            }
            var currentStep = _this._activeTour.steps[_this._currentStepIndex];
            _this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.STEP_COMPLETED, (_a = {},
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = _this._activeTour.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ID] = currentStep.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ORDER] = _this._currentStepIndex,
                _a));
            if (_this._currentStepIndex < _this._activeTour.steps.length - 1) {
                _this._setStepIndex(_this._currentStepIndex + 1);
                _this._renderCurrentStep();
            }
            else {
                _this._completeTour();
            }
        };
        this.previousStep = function () {
            if (!_this._activeTour || _this._currentStepIndex === 0) {
                return;
            }
            _this._setStepIndex(_this._currentStepIndex - 1);
            _this._renderCurrentStep();
        };
        this.dismissTour = function (reason) {
            var _a, _b;
            if (reason === void 0) { reason = 'user_clicked_skip'; }
            if (!_this._activeTour) {
                return;
            }
            var currentStep = _this._activeTour.steps[_this._currentStepIndex];
            _this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.DISMISSED, (_a = {},
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = _this._activeTour.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ID] = currentStep.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ORDER] = _this._currentStepIndex,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_DISMISS_REASON] = reason,
                _a));
            if (!_this._isPreviewMode) {
                storage_1.localStore._set("".concat(constants_1.TOUR_DISMISSED_KEY_PREFIX).concat(_this._activeTour.id), true);
                _this._instance.capture('$set', {
                    $set: (_b = {}, _b["$product_tour_dismissed/".concat(_this._activeTour.id)] = true, _b),
                });
            }
            window.dispatchEvent(new CustomEvent('PHProductTourDismissed', { detail: { tourId: _this._activeTour.id, reason: reason } }));
            _this._cleanup();
        };
        this._handleBannerActionClick = function () {
            var _a;
            var _b;
            if (!_this._activeTour) {
                return;
            }
            var step = _this._getCurrentStep();
            if (!step) {
                return;
            }
            var action = (_b = step.bannerConfig) === null || _b === void 0 ? void 0 : _b.action;
            _this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.BANNER_ACTION_CLICKED, (_a = {},
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = _this._activeTour.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_NAME] = _this._activeTour.name,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ITERATION] = _this._activeTour.current_iteration || 1,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ID] = step.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ORDER] = _this._currentStepIndex,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BUTTON_ACTION] = action === null || action === void 0 ? void 0 : action.type,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BUTTON_LINK] = action === null || action === void 0 ? void 0 : action.link,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BUTTON_TOUR_ID] = action === null || action === void 0 ? void 0 : action.tourId,
                _a));
            if ((action === null || action === void 0 ? void 0 : action.type) === 'trigger_tour' && action.tourId) {
                _this._cleanup();
                _this.showTourById(action.tourId);
            }
        };
        this._handleButtonClick = function (button) {
            var _a, _b, _c;
            if (_this._activeTour) {
                var currentStep = _this._activeTour.steps[_this._currentStepIndex];
                if (currentStep) {
                    _this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.BUTTON_CLICKED, __assign(__assign((_a = {}, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = _this._activeTour.id, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_NAME] = _this._activeTour.name, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ITERATION] = _this._activeTour.current_iteration || 1, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ID] = currentStep.id, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ORDER] = _this._currentStepIndex, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BUTTON_TEXT] = button.text, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BUTTON_ACTION] = button.action, _a), (button.link && (_b = {}, _b[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BUTTON_LINK] = button.link, _b))), (button.tourId && (_c = {}, _c[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BUTTON_TOUR_ID] = button.tourId, _c))));
                }
            }
            switch (button.action) {
                case 'dismiss':
                    _this.dismissTour('user_clicked_skip');
                    break;
                case 'next_step':
                    _this.nextStep();
                    break;
                case 'previous_step':
                    _this.previousStep();
                    break;
                case 'link':
                    _this._completeTour();
                    break;
                case 'trigger_tour':
                    if (button.tourId) {
                        _this._completeTour();
                        _this.showTourById(button.tourId);
                    }
                    break;
            }
        };
        this._instance = instance;
        this._eventReceiver = new product_tour_event_receiver_1.ProductTourEventReceiver(instance);
    }
    ProductTourManager.prototype._preloadTourImages = function (tours) {
        var e_1, _a;
        var urls = tours
            .filter(function (tour) { return !tour.disable_image_preload; })
            .flatMap(function (tour) { return tour.steps.flatMap(product_tours_utils_1.getStepImageUrls); });
        try {
            for (var urls_1 = __values(urls), urls_1_1 = urls_1.next(); !urls_1_1.done; urls_1_1 = urls_1.next()) {
                var url = urls_1_1.value;
                if (!this._preloadedImageUrls.has(url)) {
                    this._preloadedImageUrls.add(url);
                    new Image().src = url;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (urls_1_1 && !urls_1_1.done && (_a = urls_1.return)) _a.call(urls_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
    };
    ProductTourManager.prototype._getCurrentStep = function () {
        var _a;
        if (!this._activeTour) {
            return null;
        }
        var rawStep = this._activeTour.steps[this._currentStepIndex];
        if (!rawStep) {
            return null;
        }
        var language = (_a = this._instance.config.override_display_language) !== null && _a !== void 0 ? _a : (0, event_utils_1.getBrowserLanguage)();
        return (0, product_tours_utils_1.resolveStepTranslation)(rawStep, language !== null && language !== void 0 ? language : null);
    };
    ProductTourManager.prototype._setStepIndex = function (index) {
        this._currentStepIndex = index;
        this._saveSessionState();
    };
    ProductTourManager.prototype._saveSessionState = function () {
        if (!this._activeTour || this._isPreviewMode) {
            return;
        }
        storage_1.sessionStore._set(constants_1.ACTIVE_TOUR_SESSION_KEY, {
            tourId: this._activeTour.id,
            stepIndex: this._currentStepIndex,
        });
    };
    ProductTourManager.prototype._clearSessionState = function () {
        storage_1.sessionStore._remove(constants_1.ACTIVE_TOUR_SESSION_KEY);
    };
    ProductTourManager.prototype._getSessionState = function () {
        var stored = storage_1.sessionStore._get(constants_1.ACTIVE_TOUR_SESSION_KEY);
        if (!stored) {
            return null;
        }
        try {
            return JSON.parse(stored);
        }
        catch (_a) {
            return null;
        }
    };
    ProductTourManager.prototype.start = function () {
        var _this = this;
        if (this._checkInterval) {
            return;
        }
        // Check for saved session state before starting the evaluation loop
        var savedState = this._getSessionState();
        if (savedState) {
            this._resumeSavedTour(savedState.tourId, savedState.stepIndex, function () {
                _this._startEvaluationLoop();
            });
        }
        else {
            this._startEvaluationLoop();
        }
    };
    ProductTourManager.prototype._startEvaluationLoop = function () {
        var _this = this;
        this._checkInterval = setInterval(function () {
            _this._evaluateAndDisplayTours();
        }, CHECK_INTERVAL_MS);
        this._evaluateAndDisplayTours(true);
        (0, utils_1.addEventListener)(document, 'visibilitychange', this._handleVisibilityChange);
    };
    ProductTourManager.prototype._resumeSavedTour = function (tourId, stepIndex, onComplete) {
        var _this = this;
        var _a;
        (_a = this._instance.productTours) === null || _a === void 0 ? void 0 : _a.getProductTours(function (tours) {
            var tour = tours.find(function (t) { return t.id === tourId; });
            if (!tour) {
                if (tours.length > 0) {
                    _this._clearSessionState();
                }
            }
            else {
                _this._activeTour = tour;
                _this._currentStepIndex = stepIndex;
                _this._isResuming = true;
                _this._renderCurrentStep();
            }
            onComplete();
        });
    };
    ProductTourManager.prototype.stop = function () {
        if (this._checkInterval) {
            clearInterval(this._checkInterval);
            this._checkInterval = null;
        }
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);
        this._removeAllTriggerListeners();
        this._cancelAllPendingTours();
        this._cleanup();
    };
    ProductTourManager.prototype._evaluateAndDisplayTours = function (forceReload) {
        var _this = this;
        var _a;
        if (document === null || document === void 0 ? void 0 : document.getElementById(constants_2.TOOLBAR_ID)) {
            return;
        }
        // Use getProductTours (not getActiveProductTours) because selector-triggered tours
        // should work even if completed/dismissed
        (_a = this._instance.productTours) === null || _a === void 0 ? void 0 : _a.getProductTours(function (tours) {
            var e_2, _a;
            var _b;
            if (tours.length === 0) {
                _this._removeAllTriggerListeners();
                return;
            }
            _this._preloadTourImages(tours);
            var activeTriggerTourIds = new Set();
            var unregisteredEventTours = tours.filter(function (tour) {
                return !_this._registeredEventTourIds.has(tour.id) &&
                    ((0, product_tour_utils_1.doesTourActivateByEvent)(tour) || (0, product_tour_utils_1.doesTourActivateByAction)(tour));
            });
            if (unregisteredEventTours.length > 0) {
                _this._eventReceiver.register(unregisteredEventTours);
                unregisteredEventTours.forEach(function (tour) { return _this._registeredEventTourIds.add(tour.id); });
            }
            var eventActivatedTourIds = _this._activeTour ? [] : _this._eventReceiver.getTours();
            try {
                /**
                 * tours can be shown three ways, really:
                 *
                 * 1) selector clicks
                 * 2a) auto-show immediately
                 * 2b) auto-show after event/action
                 *
                 * (1) and (2[a|b]) are fully independent of each other
                 */
                for (var tours_1 = __values(tours), tours_1_1 = tours_1.next(); !tours_1_1.done; tours_1_1 = tours_1.next()) {
                    var tour = tours_1_1.value;
                    // 1) SELECTOR CLICK TRIGGER - just attach an event listener and keep going
                    var triggerSelector = (_b = tour.conditions) === null || _b === void 0 ? void 0 : _b.selector;
                    if (triggerSelector) {
                        activeTriggerTourIds.add(tour.id);
                        _this._manageTriggerSelectorListener(tour, triggerSelector);
                    }
                    // skip auto-launch checks if a tour is already active
                    if (_this._activeTour) {
                        continue;
                    }
                    // 2) AUTO-LAUNCH
                    var hasEventOrActionTriggers = (0, product_tour_utils_1.doesTourActivateByAction)(tour) || (0, product_tour_utils_1.doesTourActivateByEvent)(tour);
                    if (tour.auto_launch && _this._isTourEligible(tour)) {
                        // tour should auto-launch, and the current session is eligible
                        if (!hasEventOrActionTriggers) {
                            // 2a) AUTO-SHOW WITH NO EVENT/ACTION
                            _this._showOrQueueTour(tour, 'auto');
                            continue;
                        }
                        // 2b) AUTO-SHOW, BUT WAIT FOR EVENT/ACTION
                        if (eventActivatedTourIds.includes(tour.id)) {
                            _this._showOrQueueTour(tour, 'event');
                        }
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (tours_1_1 && !tours_1_1.done && (_a = tours_1.return)) _a.call(tours_1);
                }
                finally { if (e_2) throw e_2.error; }
            }
            _this._triggerSelectorListeners.forEach(function (_a) {
                var tour = _a.tour;
                if (!activeTriggerTourIds.has(tour.id)) {
                    _this._removeTriggerSelectorListener(tour.id);
                }
            });
        }, forceReload);
    };
    ProductTourManager.prototype._showOrQueueTour = function (tour, reason) {
        var _a;
        var delaySeconds = ((_a = tour.conditions) === null || _a === void 0 ? void 0 : _a.autoShowDelaySeconds) || 0;
        if (delaySeconds > 0) {
            if (!this.isTourPending(tour.id)) {
                this.queueTourWithDelay(tour.id, delaySeconds, reason);
            }
        }
        else {
            this.showTour(tour, { reason: reason });
        }
    };
    ProductTourManager.prototype._isTourEligible = function (tour) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!checkTourConditions(tour)) {
            logger.info("Tour ".concat(tour.id, " failed conditions check"));
            return false;
        }
        var displayFrequency = (_a = tour.display_frequency) !== null && _a !== void 0 ? _a : 'until_interacted';
        var shownKey = "".concat(constants_1.TOUR_SHOWN_KEY_PREFIX).concat(tour.id);
        var completedKey = "".concat(constants_1.TOUR_COMPLETED_KEY_PREFIX).concat(tour.id);
        var dismissedKey = "".concat(constants_1.TOUR_DISMISSED_KEY_PREFIX).concat(tour.id);
        switch (displayFrequency) {
            case 'show_once':
                if (storage_1.localStore._get(shownKey)) {
                    logger.info("Tour ".concat(tour.id, " already shown (show_once frequency)"));
                    return false;
                }
                break;
            case 'until_interacted':
                if (storage_1.localStore._get(completedKey) || storage_1.localStore._get(dismissedKey)) {
                    logger.info("Tour ".concat(tour.id, " already completed or dismissed"));
                    return false;
                }
                break;
            case 'always':
            default:
                break;
        }
        if (!(0, product_tours_utils_1.hasTourWaitPeriodPassed)((_b = tour.conditions) === null || _b === void 0 ? void 0 : _b.seenTourWaitPeriod)) {
            logger.info("Cannot show tour ".concat(tour.id, ": user has seen a ").concat((_d = (_c = tour.conditions) === null || _c === void 0 ? void 0 : _c.seenTourWaitPeriod) === null || _d === void 0 ? void 0 : _d.types, " tour within the last ").concat((_f = (_e = tour.conditions) === null || _e === void 0 ? void 0 : _e.seenTourWaitPeriod) === null || _f === void 0 ? void 0 : _f.days, " days."));
            return false;
        }
        if (!this._isProductToursFeatureFlagEnabled({ flagKey: tour.internal_targeting_flag_key })) {
            logger.info("Tour ".concat(tour.id, " failed feature flag check: ").concat(tour.internal_targeting_flag_key));
            return false;
        }
        var linkedFlagVariant = (_g = tour.conditions) === null || _g === void 0 ? void 0 : _g.linkedFlagVariant;
        if (!this._isProductToursFeatureFlagEnabled({ flagKey: tour.linked_flag_key, flagVariant: linkedFlagVariant })) {
            logger.info("Tour ".concat(tour.id, " failed feature flag check: ").concat(tour.linked_flag_key, ", variant: ").concat(linkedFlagVariant));
            return false;
        }
        return true;
    };
    ProductTourManager.prototype.showTour = function (tour, options) {
        var _a, _b;
        var _c;
        var renderReason = (_c = options === null || options === void 0 ? void 0 : options.reason) !== null && _c !== void 0 ? _c : 'auto';
        this.cancelPendingTour(tour.id);
        this._activeTour = tour;
        this._setStepIndex(0);
        var rendered = this._renderCurrentStep();
        if (rendered) {
            this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.SHOWN, (_a = {},
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = tour.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_NAME] = tour.name,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ITERATION] = tour.current_iteration || 1,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_RENDER_REASON] = renderReason,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_TYPE] = tour.tour_type,
                _a));
            if (!this._isPreviewMode) {
                storage_1.localStore._set("".concat(constants_1.TOUR_SHOWN_KEY_PREFIX).concat(tour.id), true);
                storage_1.localStore._set("".concat(constants_1.LAST_SEEN_TOUR_DATE_KEY_PREFIX).concat(tour.tour_type), new Date().toISOString());
                this._instance.capture('$set', {
                    $set: (_b = {}, _b["$product_tour_shown/".concat(tour.id)] = true, _b),
                });
            }
        }
        else {
            this._cleanup();
        }
        return rendered;
    };
    ProductTourManager.prototype.showTourById = function (tourId, reason) {
        var _this = this;
        var _a;
        logger.info("showTourById(".concat(tourId, ")"));
        (_a = this._instance.productTours) === null || _a === void 0 ? void 0 : _a.getProductTours(function (tours) {
            var tour = tours.find(function (t) { return t.id === tourId; });
            if (tour) {
                _this.showTour(tour, { reason: reason !== null && reason !== void 0 ? reason : 'api' });
            }
            else {
                logger.warn('could not find tour', tourId);
            }
        });
    };
    ProductTourManager.prototype.previewTour = function (tour) {
        logger.info("Previewing tour ".concat(tour.id));
        this._cleanup();
        this._isPreviewMode = true;
        this._activeTour = tour;
        this._currentStepIndex = 0;
        this._renderCurrentStep();
    };
    ProductTourManager.prototype._completeTour = function () {
        var _a, _b;
        if (!this._activeTour) {
            return;
        }
        this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.COMPLETED, (_a = {},
            _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = this._activeTour.id,
            _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEPS_COUNT] = this._activeTour.steps.length,
            _a));
        if (!this._isPreviewMode) {
            storage_1.localStore._set("".concat(constants_1.TOUR_COMPLETED_KEY_PREFIX).concat(this._activeTour.id), true);
            this._instance.capture('$set', {
                $set: (_b = {},
                    _b["$product_tour_completed/".concat(this._activeTour.id)] = true,
                    _b),
            });
        }
        window.dispatchEvent(new CustomEvent('PHProductTourCompleted', { detail: { tourId: this._activeTour.id } }));
        this._cleanup();
    };
    ProductTourManager.prototype._renderCurrentStep = function (retryCount) {
        var _a, _b, _c;
        var _this = this;
        var _d;
        if (retryCount === void 0) { retryCount = 0; }
        if (!this._activeTour) {
            return false;
        }
        var step = this._getCurrentStep();
        if (!step) {
            logger.warn("Step ".concat(this._currentStepIndex, " not found in tour ").concat(this._activeTour.id));
            this._cleanup();
            return false;
        }
        // Banner step - render full-width banner
        if (step.type === 'banner') {
            this._captureStepShown();
            this._isResuming = false;
            this._renderBanner();
            return true;
        }
        // Survey step - render native survey step component
        if (step.type === 'survey') {
            if (step.survey) {
                this._renderSurveyStep();
                return true;
            }
            logger.warn('Unable to render survey step - survey data not found');
            return false;
        }
        // Screen-positioned step (no element targeting) - render without a target element
        if (!(0, product_tours_utils_1.hasElementTarget)(step)) {
            this._captureStepShown();
            this._isResuming = false;
            this._renderTooltipWithPreact(null);
            return true;
        }
        var result = (0, product_tours_utils_1.findStepElement)(step);
        var inferenceProps = (_a = {},
            _a[posthog_product_tours_types_1.ProductTourEventProperties.USE_MANUAL_SELECTOR] = (_d = step.useManualSelector) !== null && _d !== void 0 ? _d : false,
            _a[posthog_product_tours_types_1.ProductTourEventProperties.INFERENCE_DATA_PRESENT] = !!step.inferenceData,
            _a);
        var previousStep = this._currentStepIndex > 0 ? this._activeTour.steps[this._currentStepIndex - 1] : null;
        var shouldWaitForElement = (previousStep === null || previousStep === void 0 ? void 0 : previousStep.progressionTrigger) === 'click' || this._isResuming;
        // 2s total timeout
        var maxRetries = 20;
        var retryTimeout = 100;
        if (result.error === 'not_found' || result.error === 'not_visible') {
            // if previous step was click-to-progress, or we are resuming a tour,
            // give some time for the next element
            if (shouldWaitForElement && retryCount < maxRetries) {
                setTimeout(function () {
                    _this._renderCurrentStep(retryCount + 1);
                }, retryTimeout);
                return false;
            }
            var waitDurationMs = retryCount * retryTimeout;
            this._captureStepSelectorFailed(result, __assign((_b = {}, _b[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_WAITED_FOR_ELEMENT] = shouldWaitForElement, _b[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_WAIT_DURATION_MS] = waitDurationMs, _b), inferenceProps));
            if (this._currentStepIndex === 0 && !this._isResuming) {
                logger.warn("Tour \"".concat(this._activeTour.name, "\" failed to show: element for first step not found (").concat(result.error, ")"));
                return false;
            }
            logger.warn("Tour \"".concat(this._activeTour.name, "\" dismissed: element for step ").concat(this._currentStepIndex, " became unavailable (").concat(result.error, ")") +
                (shouldWaitForElement ? " after waiting ".concat(waitDurationMs, "ms") : ''));
            this.dismissTour('element_unavailable');
            return false;
        }
        if (result.error === 'multiple_matches') {
            this._captureStepSelectorFailed(result, inferenceProps);
            // Continue with first match for multiple_matches case
        }
        if (!result.element) {
            return false;
        }
        var element = result.element;
        var metadata = (0, product_tours_utils_1.getElementMetadata)(element);
        this._captureStepShown(__assign((_c = {}, _c[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_SELECTOR] = step.selector, _c[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_SELECTOR_FOUND] = true, _c[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ELEMENT_TAG] = metadata.tag, _c[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ELEMENT_ID] = metadata.id, _c[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ELEMENT_CLASSES] = metadata.classes, _c[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ELEMENT_TEXT] = metadata.text, _c), inferenceProps));
        this._isResuming = false;
        this._renderTooltipWithPreact(element);
        return true;
    };
    ProductTourManager.prototype._renderTooltipWithPreact = function (element, onSurveySubmit, onDismissOverride) {
        if (!this._activeTour) {
            return;
        }
        var step = this._getCurrentStep();
        if (!step) {
            return;
        }
        var shadow = retrieveTourShadow(this._activeTour).shadow;
        (0, preact_1.render)((0, jsx_runtime_1.jsx)(ProductTourTooltip_1.ProductTourTooltip, { tour: this._activeTour, step: step, stepIndex: this._currentStepIndex, totalSteps: this._activeTour.steps.length, targetElement: element, onNext: this.nextStep, onPrevious: this.previousStep, onDismiss: onDismissOverride || this.dismissTour, onSurveySubmit: onSurveySubmit, onButtonClick: this._handleButtonClick }), shadow);
    };
    ProductTourManager.prototype._renderBanner = function () {
        var _a;
        var _this = this;
        var _b;
        if (!this._activeTour) {
            return;
        }
        var step = this._getCurrentStep();
        if (!step) {
            return;
        }
        var result = retrieveBannerShadow(this._activeTour, step.bannerConfig);
        if (!result) {
            this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.BANNER_CONTAINER_SELECTOR_FAILED, (_a = {},
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = this._activeTour.id,
                _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_BANNER_SELECTOR] = (_b = step === null || step === void 0 ? void 0 : step.bannerConfig) === null || _b === void 0 ? void 0 : _b.selector,
                _a));
            this.dismissTour('container_unavailable');
            return;
        }
        var shadow = result.shadow;
        (0, preact_1.render)((0, jsx_runtime_1.jsx)(ProductTourBanner_1.ProductTourBanner, { step: step, onDismiss: function () { return _this.dismissTour('user_clicked_skip'); }, onActionClick: this._handleBannerActionClick, displayFrequency: this._activeTour.display_frequency }), shadow);
    };
    ProductTourManager.prototype._renderSurveyStep = function () {
        var _a, _b;
        var _this = this;
        var _c, _d, _e;
        if (!this._activeTour) {
            return;
        }
        var tourId = this._activeTour.id;
        var step = this._getCurrentStep();
        if (!step) {
            return;
        }
        var surveyId = step.linkedSurveyId;
        var questionId = step.linkedSurveyQuestionId;
        var questionText = ((_c = step.survey) === null || _c === void 0 ? void 0 : _c.questionText) || '';
        this._captureStepShown((_a = {},
            _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_LINKED_SURVEY_ID] = surveyId,
            _a));
        this._captureEvent(posthog_surveys_types_1.SurveyEventName.SHOWN, (_b = {},
            _b[posthog_surveys_types_1.SurveyEventProperties.SURVEY_ID] = surveyId,
            _b[posthog_surveys_types_1.SurveyEventProperties.PRODUCT_TOUR_ID] = tourId,
            _b.sessionRecordingUrl = (_e = (_d = this._instance).get_session_replay_url) === null || _e === void 0 ? void 0 : _e.call(_d),
            _b));
        var handleSubmit = function (response) {
            var _a, _b;
            var _c, _d;
            var responseKey = questionId ? "$survey_response_".concat(questionId) : '$survey_response';
            _this._captureEvent(posthog_surveys_types_1.SurveyEventName.SENT, __assign((_a = {}, _a[posthog_surveys_types_1.SurveyEventProperties.SURVEY_ID] = surveyId, _a[posthog_surveys_types_1.SurveyEventProperties.PRODUCT_TOUR_ID] = tourId, _a[posthog_surveys_types_1.SurveyEventProperties.SURVEY_QUESTIONS] = [
                {
                    id: questionId,
                    question: questionText,
                    response: response,
                },
            ], _a[posthog_surveys_types_1.SurveyEventProperties.SURVEY_COMPLETED] = true, _a.sessionRecordingUrl = (_d = (_c = _this._instance).get_session_replay_url) === null || _d === void 0 ? void 0 : _d.call(_c), _a), (!(0, core_1.isNull)(response) && (_b = {}, _b[responseKey] = response, _b))));
            logger.info("Survey ".concat(surveyId, " completed"), !(0, core_1.isNull)(response) ? "with response: ".concat(response) : '(skipped)');
            _this.nextStep();
        };
        var handleDismiss = function (reason) {
            var _a;
            var _b, _c;
            _this._captureEvent(posthog_surveys_types_1.SurveyEventName.DISMISSED, (_a = {},
                _a[posthog_surveys_types_1.SurveyEventProperties.SURVEY_ID] = surveyId,
                _a[posthog_surveys_types_1.SurveyEventProperties.PRODUCT_TOUR_ID] = tourId,
                _a[posthog_surveys_types_1.SurveyEventProperties.SURVEY_QUESTIONS] = [
                    {
                        id: questionId,
                        question: questionText,
                        response: null,
                    },
                ],
                _a[posthog_surveys_types_1.SurveyEventProperties.SURVEY_PARTIALLY_COMPLETED] = false,
                _a.sessionRecordingUrl = (_c = (_b = _this._instance).get_session_replay_url) === null || _c === void 0 ? void 0 : _c.call(_b),
                _a));
            logger.info("Survey ".concat(surveyId, " dismissed"));
            _this.dismissTour(reason);
        };
        this._renderTooltipWithPreact(null, handleSubmit, handleDismiss);
        logger.info("Rendered survey step for tour step ".concat(this._currentStepIndex));
    };
    ProductTourManager.prototype._isProductToursFeatureFlagEnabled = function (_a) {
        var _b, _c;
        var flagKey = _a.flagKey, flagVariant = _a.flagVariant;
        if (!flagKey) {
            return true;
        }
        var isFeatureEnabled = !!((_b = this._instance.featureFlags) === null || _b === void 0 ? void 0 : _b.isFeatureEnabled(flagKey, {
            send_event: !flagKey.startsWith(PRODUCT_TOUR_TARGETING_FLAG_PREFIX),
        }));
        var flagVariantCheck = true;
        if (flagVariant) {
            var flagVariantValue = (_c = this._instance.featureFlags) === null || _c === void 0 ? void 0 : _c.getFeatureFlag(flagKey, { send_event: false });
            flagVariantCheck = flagVariantValue === flagVariant || flagVariant === 'any';
        }
        return isFeatureEnabled && flagVariantCheck;
    };
    ProductTourManager.prototype._cleanup = function () {
        if (this._activeTour) {
            removeTourFromDom(this._activeTour.id);
        }
        this._activeTour = null;
        this._currentStepIndex = 0;
        this._isPreviewMode = false;
        this._isResuming = false;
        this._clearSessionState();
    };
    ProductTourManager.prototype._manageTriggerSelectorListener = function (tour, selector) {
        var _this = this;
        var currentElement = document.querySelector(selector);
        var existingListenerData = this._triggerSelectorListeners.get(tour.id);
        if (!currentElement) {
            if (existingListenerData) {
                this._removeTriggerSelectorListener(tour.id);
            }
            return;
        }
        if (existingListenerData) {
            if (currentElement !== existingListenerData.element) {
                logger.info("Trigger element changed for tour ".concat(tour.id, ". Re-attaching listener."));
                this._removeTriggerSelectorListener(tour.id);
            }
            else {
                return;
            }
        }
        if (!currentElement.hasAttribute(TRIGGER_LISTENER_ATTRIBUTE)) {
            var listener = function (event) {
                var _a;
                if (_this._activeTour) {
                    logger.info("Tour ".concat(tour.id, " trigger clicked but another tour is active"));
                    return;
                }
                var currentTour;
                (_a = _this._instance.productTours) === null || _a === void 0 ? void 0 : _a.getProductTours(function (tours) {
                    currentTour = tours.find(function (t) { return t.id === tour.id; });
                });
                if (!currentTour) {
                    logger.warn("Tour ".concat(tour.id, " no longer exists. Removing stale listener."));
                    _this._removeTriggerSelectorListener(tour.id);
                    return;
                }
                if (!isTourInDateRange(currentTour)) {
                    logger.warn("Tour ".concat(tour.id, " trigger clicked, but tour is not launched - not showing tour."));
                    return;
                }
                logger.info("Tour ".concat(tour.id, " triggered by click on ").concat(selector));
                if (_this.showTour(currentTour, { reason: 'trigger' })) {
                    event.preventDefault();
                }
                else {
                    logger.info("Tour ".concat(tour.id, " failed to show; not intercepting click."));
                }
            };
            (0, utils_1.addEventListener)(currentElement, 'click', listener);
            currentElement.setAttribute(TRIGGER_LISTENER_ATTRIBUTE, tour.id);
            this._triggerSelectorListeners.set(tour.id, { element: currentElement, listener: listener, tour: tour });
            logger.info("Attached trigger listener for tour ".concat(tour.id, " on ").concat(selector));
        }
    };
    ProductTourManager.prototype._removeTriggerSelectorListener = function (tourId) {
        var existing = this._triggerSelectorListeners.get(tourId);
        if (existing) {
            existing.element.removeEventListener('click', existing.listener);
            existing.element.removeAttribute(TRIGGER_LISTENER_ATTRIBUTE);
            this._triggerSelectorListeners.delete(tourId);
            logger.info("Removed trigger listener for tour ".concat(tourId));
        }
    };
    ProductTourManager.prototype._removeAllTriggerListeners = function () {
        var _this = this;
        this._triggerSelectorListeners.forEach(function (_, tourId) {
            _this._removeTriggerSelectorListener(tourId);
        });
    };
    ProductTourManager.prototype._captureEvent = function (eventName, properties) {
        if (this._isPreviewMode) {
            return;
        }
        this._instance.capture(eventName, properties);
    };
    ProductTourManager.prototype._captureStepShown = function (extraProps) {
        var _a;
        if (!this._activeTour) {
            return;
        }
        var step = this._activeTour.steps[this._currentStepIndex];
        this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.STEP_SHOWN, __assign((_a = {}, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = this._activeTour.id, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ID] = step.id, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ORDER] = this._currentStepIndex, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_TYPE] = step.type, _a), extraProps));
    };
    ProductTourManager.prototype._captureStepSelectorFailed = function (result, extraProps) {
        var _a;
        if (!this._activeTour) {
            return;
        }
        var step = this._activeTour.steps[this._currentStepIndex];
        this._captureEvent(posthog_product_tours_types_1.ProductTourEventName.STEP_SELECTOR_FAILED, __assign((_a = {}, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ID] = this._activeTour.id, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ID] = step.id, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_ORDER] = this._currentStepIndex, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_STEP_SELECTOR] = step.selector, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_ERROR] = result.error, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_MATCHES_COUNT] = result.matchCount, _a[posthog_product_tours_types_1.ProductTourEventProperties.TOUR_FAILURE_PHASE] = 'runtime', _a), extraProps));
    };
    // Public API methods delegated from PostHogProductTours
    ProductTourManager.prototype.getActiveProductTours = function (callback) {
        var _this = this;
        var _a;
        (_a = this._instance.productTours) === null || _a === void 0 ? void 0 : _a.getProductTours(function (tours, context) {
            if (!(context === null || context === void 0 ? void 0 : context.isLoaded)) {
                callback([], context);
                return;
            }
            var activeTours = tours.filter(function (tour) { return _this._isTourEligible(tour); });
            callback(activeTours, context);
        });
    };
    ProductTourManager.prototype.resetTour = function (tourId) {
        storage_1.localStore._remove("".concat(constants_1.TOUR_SHOWN_KEY_PREFIX).concat(tourId));
        storage_1.localStore._remove("".concat(constants_1.TOUR_COMPLETED_KEY_PREFIX).concat(tourId));
        storage_1.localStore._remove("".concat(constants_1.TOUR_DISMISSED_KEY_PREFIX).concat(tourId));
    };
    ProductTourManager.prototype.resetAllTours = function () {
        var storage = window === null || window === void 0 ? void 0 : window.localStorage;
        if (!storage) {
            return;
        }
        var keysToRemove = [];
        for (var i = 0; i < storage.length; i++) {
            var key = storage.key(i);
            if ((key === null || key === void 0 ? void 0 : key.startsWith(constants_1.TOUR_SHOWN_KEY_PREFIX)) ||
                (key === null || key === void 0 ? void 0 : key.startsWith(constants_1.TOUR_COMPLETED_KEY_PREFIX)) ||
                (key === null || key === void 0 ? void 0 : key.startsWith(constants_1.TOUR_DISMISSED_KEY_PREFIX)) ||
                (key === null || key === void 0 ? void 0 : key.startsWith(constants_1.LAST_SEEN_TOUR_DATE_KEY_PREFIX))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(function (key) { return storage_1.localStore._remove(key); });
    };
    ProductTourManager.prototype.cancelPendingTour = function (tourId) {
        var timeout = this._pendingTourTimeouts.get(tourId);
        if (timeout) {
            clearTimeout(timeout);
            this._pendingTourTimeouts.delete(tourId);
            logger.info("Cancelled pending tour: ".concat(tourId));
        }
    };
    ProductTourManager.prototype._cancelAllPendingTours = function () {
        this._pendingTourTimeouts.forEach(function (timeout) { return clearTimeout(timeout); });
        this._pendingTourTimeouts.clear();
    };
    ProductTourManager.prototype.isTourPending = function (tourId) {
        return this._pendingTourTimeouts.has(tourId);
    };
    ProductTourManager.prototype.queueTourWithDelay = function (tourId, delaySeconds, reason) {
        var _this = this;
        logger.info("Queueing tour ".concat(tourId, " with ").concat(delaySeconds, "s delay"));
        var timeoutId = setTimeout(function () {
            _this._pendingTourTimeouts.delete(tourId);
            logger.info("Delay elapsed for tour ".concat(tourId, ", showing now"));
            _this.showTourById(tourId, reason);
        }, delaySeconds * 1000);
        this._pendingTourTimeouts.set(tourId, timeoutId);
    };
    return ProductTourManager;
}());
exports.ProductTourManager = ProductTourManager;
//# sourceMappingURL=product-tours.js.map