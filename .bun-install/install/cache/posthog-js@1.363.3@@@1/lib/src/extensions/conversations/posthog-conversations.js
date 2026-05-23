"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostHogConversations = void 0;
var constants_1 = require("../../constants");
var globals_1 = require("../../utils/globals");
var logger_1 = require("../../utils/logger");
var core_1 = require("@posthog/core");
var utils_1 = require("../../utils");
var logger = (0, logger_1.createLogger)('[Conversations]');
var NOT_AVAILABLE = 'Conversations not available yet.';
var PostHogConversations = /** @class */ (function () {
    function PostHogConversations(_instance) {
        this._instance = _instance;
        // This is set to undefined until the remote config is loaded
        // then it's set to true if conversations are enabled
        // or false if conversations are disabled in the project settings
        this._isConversationsEnabled = undefined;
        this._conversationsManager = null;
        this._isInitializing = false;
        this._remoteConfig = null;
    }
    PostHogConversations.prototype.initialize = function () {
        this.loadIfEnabled();
    };
    PostHogConversations.prototype.onRemoteConfig = function (response) {
        // Don't load conversations if disabled via config
        if (this._instance.config.disable_conversations) {
            return;
        }
        var conversations = response['conversations'];
        if ((0, core_1.isNullish)(conversations)) {
            return;
        }
        // Handle both boolean and object response
        if ((0, core_1.isBoolean)(conversations)) {
            this._isConversationsEnabled = conversations;
        }
        else {
            // It's a ConversationsRemoteConfig object
            this._isConversationsEnabled = conversations.enabled;
            this._remoteConfig = conversations;
        }
        this.loadIfEnabled();
    };
    PostHogConversations.prototype.reset = function () {
        var _a;
        // Delegate cleanup to the lazy-loaded manager (which knows about persistence keys)
        // If not loaded, there's nothing to reset anyway
        (_a = this._conversationsManager) === null || _a === void 0 ? void 0 : _a.reset();
        this._conversationsManager = null;
        // Reset local state
        this._isConversationsEnabled = undefined;
        this._remoteConfig = null;
    };
    PostHogConversations.prototype.loadIfEnabled = function () {
        var _this = this;
        if (this._conversationsManager) {
            return;
        }
        if (this._isInitializing) {
            return;
        }
        if (this._instance.config.disable_conversations) {
            return;
        }
        // The toolbar's internal PostHog instance must not own the conversations
        // manager — its distinct_id is always anonymous and would be sent instead
        // of the identified user's ID.
        if ((0, utils_1.isToolbarInstance)(this._instance.config)) {
            return;
        }
        if (this._instance.config.cookieless_mode && this._instance.consent.isOptedOut()) {
            return;
        }
        var phExtensions = globals_1.assignableWindow === null || globals_1.assignableWindow === void 0 ? void 0 : globals_1.assignableWindow.__PosthogExtensions__;
        if (!phExtensions) {
            return;
        }
        // Wait for remote config to load
        if ((0, core_1.isUndefined)(this._isConversationsEnabled)) {
            return;
        }
        // Check if conversations are enabled
        if (!this._isConversationsEnabled) {
            return;
        }
        // Check if we have the required config
        if (!this._remoteConfig || !this._remoteConfig.token) {
            logger.error('Conversations enabled but missing token in remote config.');
            return;
        }
        // Note: Domain check is done in ConversationsManager for widget rendering
        // The conversations API is loaded regardless of domain restrictions
        this._isInitializing = true;
        try {
            var initConversations = phExtensions.initConversations;
            if (initConversations) {
                // Conversations code is already loaded
                this._completeInitialization(initConversations);
                this._isInitializing = false;
                return;
            }
            // If we reach here, conversations code is not loaded yet
            var loadExternalDependency = phExtensions.loadExternalDependency;
            if (!loadExternalDependency) {
                this._handleLoadError(constants_1.LOAD_EXT_NOT_FOUND);
                return;
            }
            // Load the conversations bundle
            loadExternalDependency(this._instance, 'conversations', function (err) {
                if (err || !phExtensions.initConversations) {
                    _this._handleLoadError('Could not load conversations script', err);
                }
                else {
                    _this._completeInitialization(phExtensions.initConversations);
                }
                _this._isInitializing = false;
            });
        }
        catch (e) {
            this._handleLoadError('Error initializing conversations', e);
            this._isInitializing = false;
        }
    };
    /** Helper to finalize conversations initialization */
    PostHogConversations.prototype._completeInitialization = function (initConversationsFn) {
        if (!this._remoteConfig) {
            logger.error('Cannot complete initialization: remote config is null');
            return;
        }
        try {
            // Pass config and PostHog instance to the extension
            this._conversationsManager = initConversationsFn(this._remoteConfig, this._instance);
            logger.info('Conversations loaded successfully');
        }
        catch (e) {
            this._handleLoadError('Error completing conversations initialization', e);
        }
    };
    /** Helper to handle initialization errors */
    PostHogConversations.prototype._handleLoadError = function (message, error) {
        logger.error(message, error);
        this._conversationsManager = null;
        this._isInitializing = false;
    };
    /**
     * Show the conversations widget (button and chat panel)
     */
    PostHogConversations.prototype.show = function () {
        if (!this._conversationsManager) {
            logger.warn('Conversations not loaded yet.');
            return;
        }
        this._conversationsManager.show();
    };
    /**
     * Hide the conversations widget completely (button and chat panel)
     */
    PostHogConversations.prototype.hide = function () {
        if (!this._conversationsManager) {
            return;
        }
        this._conversationsManager.hide();
    };
    /**
     * Check if conversations are available (enabled in remote config AND loaded)
     * Use this to check if conversations API can be used.
     */
    PostHogConversations.prototype.isAvailable = function () {
        return this._isConversationsEnabled === true && !(0, core_1.isNull)(this._conversationsManager);
    };
    /**
     * Check if the widget is currently visible (rendered and shown)
     */
    PostHogConversations.prototype.isVisible = function () {
        var _a, _b;
        return (_b = (_a = this._conversationsManager) === null || _a === void 0 ? void 0 : _a.isVisible()) !== null && _b !== void 0 ? _b : false;
    };
    /**
     * Send a message programmatically
     * Creates a new ticket if none exists or if newTicket is true
     *
     * @param message - The message text to send
     * @param userTraits - Optional user identification data (name, email)
     * @param newTicket - If true, forces creation of a new ticket (starts new conversation)
     * @returns Promise with response or null if conversations not available yet
     * @note Conversations must be available first (check with isAvailable())
     *
     * @example
     * // Send to existing or create new conversation
     * const response = await posthog.conversations.sendMessage('Hello!', {
     *   name: 'John Doe',
     *   email: 'john@example.com'
     * })
     *
     * @example
     * // Force creation of a new conversation/ticket
     * const newConvo = await posthog.conversations.sendMessage('Start fresh', undefined, true)
     */
    PostHogConversations.prototype.sendMessage = function (message, userTraits, newTicket) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._conversationsManager) {
                    logger.warn(NOT_AVAILABLE);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, this._conversationsManager.sendMessage(message, userTraits, newTicket)];
            });
        });
    };
    /**
     * Get messages for the current or specified ticket
     *
     * @param ticketId - Optional ticket ID (defaults to current active ticket)
     * @param after - Optional ISO timestamp to fetch messages after
     * @returns Promise with messages response or null if conversations not available yet
     * @note Conversations must be available first (check with isAvailable())
     *
     * @example
     * // Get messages for current ticket
     * const messages = await posthog.conversations.getMessages()
     *
     * // Get messages for specific ticket
     * const messages = await posthog.conversations.getMessages('ticket-uuid')
     */
    PostHogConversations.prototype.getMessages = function (ticketId, after) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._conversationsManager) {
                    logger.warn(NOT_AVAILABLE);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, this._conversationsManager.getMessages(ticketId, after)];
            });
        });
    };
    /**
     * Mark messages as read for the current or specified ticket
     *
     * @param ticketId - Optional ticket ID (defaults to current active ticket)
     * @returns Promise with response or null if conversations not available yet
     * @note Conversations must be available first (check with isAvailable())
     *
     * @example
     * await posthog.conversations.markAsRead()
     */
    PostHogConversations.prototype.markAsRead = function (ticketId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._conversationsManager) {
                    logger.warn(NOT_AVAILABLE);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, this._conversationsManager.markAsRead(ticketId)];
            });
        });
    };
    /**
     * Get list of tickets for the current widget session
     *
     * @param options - Optional filtering and pagination options
     * @returns Promise with tickets response or null if conversations not available yet
     * @note Conversations must be available first (check with isAvailable())
     *
     * @example
     * const tickets = await posthog.conversations.getTickets({
     *   limit: 10,
     *   offset: 0,
     *   status: 'open'
     * })
     */
    PostHogConversations.prototype.getTickets = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._conversationsManager) {
                    logger.warn(NOT_AVAILABLE);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, this._conversationsManager.getTickets(options)];
            });
        });
    };
    /**
     * Request a restore link email for previous conversations.
     *
     * @param email - Email address associated with previous conversations
     * @returns Promise with generic success response or null if conversations unavailable
     */
    PostHogConversations.prototype.requestRestoreLink = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._conversationsManager) {
                    logger.warn(NOT_AVAILABLE);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, this._conversationsManager.requestRestoreLink(email)];
            });
        });
    };
    /**
     * Redeem a restore token and relink eligible tickets to this browser session.
     *
     * @param restoreToken - Opaque restore token from restore email link
     * @returns Promise with restore status or null if conversations unavailable
     */
    PostHogConversations.prototype.restoreFromToken = function (restoreToken) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._conversationsManager) {
                    logger.warn(NOT_AVAILABLE);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, this._conversationsManager.restoreFromToken(restoreToken)];
            });
        });
    };
    /**
     * Parse and redeem `ph_conv_restore` token from the current URL.
     *
     * @returns Promise with restore status, or null when no token/conversations unavailable
     */
    PostHogConversations.prototype.restoreFromUrlToken = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._conversationsManager) {
                    logger.warn(NOT_AVAILABLE);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/, this._conversationsManager.restoreFromUrlToken()];
            });
        });
    };
    /**
     * Get the current active ticket ID
     * Returns null if no conversation has been started yet or if not available
     *
     * @returns Ticket ID or null
     * @note Safe to call before conversations are available, will return null
     *
     * @example
     * const ticketId = posthog.conversations.getCurrentTicketId()
     * if (ticketId) {
     *   console.log('Current ticket ID:', ticketId)
     * }
     */
    PostHogConversations.prototype.getCurrentTicketId = function () {
        var _a, _b;
        return (_b = (_a = this._conversationsManager) === null || _a === void 0 ? void 0 : _a.getCurrentTicketId()) !== null && _b !== void 0 ? _b : null;
    };
    /**
     * Get the widget session ID (persistent browser identifier)
     * This ID is used for access control and stays the same across page loads
     * Returns null if conversations not available yet
     *
     * @returns Session ID or null if not available
     * @note Safe to call before conversations are available, will return null
     *
     * @example
     * const sessionId = posthog.conversations.getWidgetSessionId()
     * if (!sessionId) {
     *   // Conversations not available yet
     *   posthog.conversations.show()
     * }
     */
    PostHogConversations.prototype.getWidgetSessionId = function () {
        var _a, _b;
        return (_b = (_a = this._conversationsManager) === null || _a === void 0 ? void 0 : _a.getWidgetSessionId()) !== null && _b !== void 0 ? _b : null;
    };
    return PostHogConversations;
}());
exports.PostHogConversations = PostHogConversations;
//# sourceMappingURL=posthog-conversations.js.map