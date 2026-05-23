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
exports.ConversationsManager = void 0;
exports.initConversations = initConversations;
var jsx_runtime_1 = require("preact/jsx-runtime");
// eslint-disable-next-line @typescript-eslint/no-unused-vars
var preact_1 = require("preact");
var core_1 = require("@posthog/core");
var constants_1 = require("../../../constants");
var persistence_1 = require("./persistence");
var ConversationsWidget_1 = require("./components/ConversationsWidget");
var logger_1 = require("../../../utils/logger");
var globals_1 = require("../../../utils/globals");
var request_utils_1 = require("../../../utils/request-utils");
var url_utils_1 = require("./url-utils");
var logger = (0, logger_1.createLogger)('[ConversationsManager]');
var WIDGET_CONTAINER_ID = 'ph-conversations-widget-container';
var POLL_INTERVAL_MS = 5000; // 5 seconds
var RESTORE_EXCHANGE_ENDPOINT = '/api/conversations/v1/widget/restore';
var RESTORE_REQUEST_ENDPOINT = '/api/conversations/v1/widget/restore/request';
// Singleton guard: only one ConversationsManager per page.
// The toolbar's internal PostHog instance is excluded from creating a manager
// (see PostHogConversations.loadIfEnabled), so this always belongs to the main instance.
var _activeManager = null;
var ConversationsManager = /** @class */ (function () {
    function ConversationsManager(config, _posthog) {
        var _this = this;
        this._posthog = _posthog;
        this._widgetRef = null;
        this._containerElement = null;
        this._currentTicketId = null;
        this._pollIntervalId = null;
        this._lastMessageTimestamp = null;
        this._isPollingMessages = false;
        this._isPollingTickets = false;
        this._unsubscribeIdentifyListener = null;
        this._unreadCount = 0;
        this._widgetState = 'closed';
        this._isWidgetRendered = false;
        this._hasProcessedRestoreToken = false;
        this._initializeWidgetPromise = null;
        // View state management for ticket list vs message view
        this._currentView = 'messages';
        this._tickets = [];
        this._hasMultipleTickets = false;
        /**
         * Handle user identification from the widget form
         */
        this._handleIdentify = function (traits) {
            // Save traits to localStorage
            _this._persistence.saveUserTraits(traits);
            // Track identification
            _this._posthog.capture('$conversations_user_identified', {
                hasName: !!traits.name,
                hasEmail: !!traits.email,
            });
        };
        this._handleRequestRestoreLink = function (email) { return __awaiter(_this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.requestRestoreLink(email)];
                    case 1:
                        response = _a.sent();
                        this._posthog.capture('$conversations_restore_link_requested', {
                            hasEmail: !!email,
                        });
                        return [2 /*return*/, response];
                }
            });
        }); };
        /**
         * Handle sending a message from the widget
         */
        this._handleSendMessage = function (message) { return __awaiter(_this, void 0, void 0, function () {
            var userTraits, error_1;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        userTraits = ((_a = this._widgetRef) === null || _a === void 0 ? void 0 : _a.getUserTraits()) || undefined;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        // Call the public API method (which handles tracking and state updates)
                        return [4 /*yield*/, this.sendMessage(message, userTraits)
                            // Poll for response immediately
                        ];
                    case 2:
                        // Call the public API method (which handles tracking and state updates)
                        _b.sent();
                        // Poll for response immediately
                        setTimeout(function () { return _this._pollMessages(); }, 1000);
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        logger.error('Failed to send message', error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        /**
         * Handle widget state changes
         */
        this._handleStateChange = function (state) {
            _this._widgetState = state;
            logger.info('Widget state changed', { state: state, view: _this._currentView });
            _this._posthog.capture('$conversations_widget_state_changed', {
                state: state,
                view: _this._currentView,
                ticketId: _this._currentTicketId,
            });
            _this._persistence.saveWidgetState(state);
            // Mark messages as read when widget opens (only if in message view with a ticket)
            if (state === 'open') {
                if (_this._currentView === 'messages' && _this._unreadCount > 0 && _this._currentTicketId) {
                    _this._markMessagesAsRead();
                }
            }
        };
        /**
         * Poll for new messages
         */
        this._pollMessages = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this._isPollingMessages || !this._currentTicketId) {
                            return [2 /*return*/];
                        }
                        this._isPollingMessages = true;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, this._loadMessages()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        this._isPollingMessages = false;
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        /**
         * Poll for tickets list
         */
        this._pollTickets = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this._isPollingTickets) {
                            return [2 /*return*/];
                        }
                        this._isPollingTickets = true;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, this._loadTickets()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        this._isPollingTickets = false;
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        /**
         * Main poll function that polls based on current view
         */
        this._poll = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this._currentView === 'restore_request') {
                            return [2 /*return*/];
                        }
                        if (!(this._currentView === 'messages')) return [3 /*break*/, 2];
                        return [4 /*yield*/, this._pollMessages()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this._pollTickets()];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        /**
         * Handle view changes from the widget
         */
        this._handleViewChange = function (view) {
            logger.info('View changed', { from: _this._currentView, to: view });
            _this._currentView = view;
        };
        /**
         * Handle ticket selection from the list
         */
        this._handleSelectTicket = function (ticketId) { return __awaiter(_this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        // Switch to this ticket
                        this._switchToTicketIfNeeded(ticketId);
                        // Clear messages and reset timestamp
                        this._lastMessageTimestamp = null;
                        (_a = this._widgetRef) === null || _a === void 0 ? void 0 : _a.clearMessages();
                        // Switch view to messages
                        this._currentView = 'messages';
                        (_b = this._widgetRef) === null || _b === void 0 ? void 0 : _b.setView('messages');
                        // Load messages for the selected ticket
                        return [4 /*yield*/, this._loadMessages()
                            // Mark as read if widget is open
                        ];
                    case 1:
                        // Load messages for the selected ticket
                        _c.sent();
                        // Mark as read if widget is open
                        if (this._isWidgetOpen() && this._unreadCount > 0) {
                            this._markMessagesAsRead();
                        }
                        return [2 /*return*/];
                }
            });
        }); };
        /**
         * Handle new conversation request
         */
        this._handleNewConversation = function () {
            var _a, _b;
            logger.info('New conversation requested');
            // Clear current ticket
            _this._currentTicketId = null;
            _this._persistence.clearTicketId();
            // Reset timestamp
            _this._lastMessageTimestamp = null;
            // Switch view to messages
            _this._currentView = 'messages';
            (_a = _this._widgetRef) === null || _a === void 0 ? void 0 : _a.setView('messages');
            // Clear messages and add greeting
            (_b = _this._widgetRef) === null || _b === void 0 ? void 0 : _b.clearMessages(true);
        };
        /**
         * Handle back to tickets request
         */
        this._handleBackToTickets = function () { return __awaiter(_this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        logger.info('Back to tickets requested');
                        // Switch view to tickets
                        this._currentView = 'tickets';
                        (_a = this._widgetRef) === null || _a === void 0 ? void 0 : _a.setView('tickets');
                        // Load tickets
                        (_b = this._widgetRef) === null || _b === void 0 ? void 0 : _b.setTicketsLoading(true);
                        return [4 /*yield*/, this._loadTickets()
                            // Track back to tickets
                        ];
                    case 1:
                        _c.sent();
                        // Track back to tickets
                        this._posthog.capture('$conversations_back_to_tickets');
                        return [2 /*return*/];
                }
            });
        }); };
        this._config = config;
        this._persistence = new persistence_1.ConversationsPersistence(_posthog);
        this._widgetSessionId = this._persistence.getOrCreateWidgetSessionId();
        // Determine if widget should be shown based on config and domain
        this._isWidgetEnabled = config.widgetEnabled === true;
        this._isDomainAllowed = (0, url_utils_1.isCurrentDomainAllowed)(config.domains);
        this._initialize();
    }
    /**
     * Send a message programmatically via the API
     * Creates a new ticket if none exists or if newTicket is true
     *
     * @param message - The message text to send
     * @param userTraits - Optional user identification data (name, email)
     * @param newTicket - If true, forces creation of a new ticket (ignores current ticket)
     * @returns Promise with the response including ticket_id and message_id
     */
    ConversationsManager.prototype.sendMessage = function (message, userTraits, newTicket) {
        return __awaiter(this, void 0, void 0, function () {
            var ticketId, isNewTicket, token;
            var _this = this;
            return __generator(this, function (_a) {
                ticketId = newTicket ? null : this._currentTicketId;
                isNewTicket = !ticketId;
                token = this._config.token;
                // eslint-disable-next-line compat/compat
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var _a;
                        var distinctId = _this._posthog.get_distinct_id();
                        var personTraits = _this._getPersonTraits();
                        var name = (userTraits === null || userTraits === void 0 ? void 0 : userTraits.name) || personTraits.name || null;
                        var email = (userTraits === null || userTraits === void 0 ? void 0 : userTraits.email) || personTraits.email || null;
                        var payload = {
                            widget_session_id: _this._widgetSessionId,
                            // distinct_id is only used for Person linking, not access control
                            distinct_id: distinctId,
                            message: message.trim(),
                            traits: {
                                name: name,
                                email: email,
                            },
                            ticket_id: ticketId,
                        };
                        try {
                            // Capture session ID - sent with every message
                            var capturedSessionId = _this._posthog.get_session_id();
                            if (capturedSessionId) {
                                payload.session_id = capturedSessionId;
                            }
                            // Capture session replay URL with timestamp - sent with every message
                            var replayUrl = _this._posthog.get_session_replay_url({
                                withTimestamp: true,
                                timestampLookBack: 30,
                            });
                            // Capture current URL - only for new tickets to record where user started
                            var currentUrl = isNewTicket ? (_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.location) === null || _a === void 0 ? void 0 : _a.href : undefined;
                            if (replayUrl || currentUrl) {
                                payload.session_context = {
                                    session_replay_url: replayUrl || undefined,
                                    current_url: currentUrl || undefined,
                                };
                            }
                        }
                        catch (error) {
                            // Log error but don't fail message sending
                            logger.warn('Failed to capture session context', error);
                        }
                        _this._posthog._send_request({
                            url: _this._posthog.requestRouter.endpointFor('api', '/api/conversations/v1/widget/message'),
                            method: 'POST',
                            data: payload,
                            headers: {
                                'X-Conversations-Token': token,
                            },
                            callback: function (response) {
                                var _a, _b;
                                if (response.statusCode === 429) {
                                    reject(new Error('Too many requests. Please wait before trying again.'));
                                    return;
                                }
                                if (response.statusCode !== 200 && response.statusCode !== 201) {
                                    var errorMsg = ((_a = response.json) === null || _a === void 0 ? void 0 : _a.detail) || ((_b = response.json) === null || _b === void 0 ? void 0 : _b.message) || 'Failed to send message';
                                    logger.error('Failed to send message', { status: response.statusCode });
                                    reject(new Error(errorMsg));
                                    return;
                                }
                                if (!response.json) {
                                    reject(new Error('Invalid response from server'));
                                    return;
                                }
                                var data = response.json;
                                // Update current ticket ID if this was a new ticket
                                // This happens when: 1) No ticket existed, or 2) User forced new ticket creation
                                if (isNewTicket && data.ticket_id) {
                                    _this._currentTicketId = data.ticket_id;
                                    _this._persistence.saveTicketId(data.ticket_id);
                                    logger.info('New ticket created', {
                                        ticketId: data.ticket_id,
                                        forced: newTicket === true,
                                    });
                                }
                                // Track message sent
                                _this._posthog.capture('$conversations_message_sent', {
                                    ticketId: data.ticket_id,
                                    isNewTicket: isNewTicket,
                                    messageLength: message.length,
                                });
                                // Update last message timestamp
                                _this._lastMessageTimestamp = data.created_at;
                                resolve(data);
                            },
                        });
                    })];
            });
        });
    };
    /**
     * Switch to a different ticket if an explicit ticketId is provided
     * This ensures subsequent operations (sendMessage, etc.) use the correct ticket
     */
    ConversationsManager.prototype._switchToTicketIfNeeded = function (ticketId) {
        if (ticketId && ticketId !== this._currentTicketId) {
            this._currentTicketId = ticketId;
            this._persistence.saveTicketId(ticketId);
            // Reset last message timestamp when switching tickets
            this._lastMessageTimestamp = null;
        }
    };
    /** Fetch messages via the API */
    ConversationsManager.prototype.getMessages = function (ticketId, after) {
        return __awaiter(this, void 0, void 0, function () {
            var targetTicketId, token;
            var _this = this;
            return __generator(this, function (_a) {
                targetTicketId = ticketId || this._currentTicketId;
                if (!targetTicketId) {
                    throw new Error('No ticket ID provided and no active conversation');
                }
                // Switch to this ticket if explicitly provided
                this._switchToTicketIfNeeded(ticketId);
                token = this._config.token;
                // eslint-disable-next-line compat/compat
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        // SECURITY: widget_session_id is required for access control
                        // distinct_id is NOT sent for getMessages - access is controlled by widget_session_id only
                        var queryParams = {
                            widget_session_id: _this._widgetSessionId,
                            limit: '50',
                        };
                        if (after) {
                            queryParams.after = after;
                        }
                        _this._posthog._send_request({
                            url: _this._posthog.requestRouter.endpointFor('api', "/api/conversations/v1/widget/messages/".concat(targetTicketId, "?").concat((0, request_utils_1.formDataToQuery)(queryParams))),
                            method: 'GET',
                            headers: {
                                'X-Conversations-Token': token,
                            },
                            callback: function (response) {
                                var _a, _b;
                                if (response.statusCode === 429) {
                                    reject(new Error('Too many requests. Please wait before trying again.'));
                                    return;
                                }
                                if (response.statusCode !== 200) {
                                    var errorMsg = ((_a = response.json) === null || _a === void 0 ? void 0 : _a.detail) || ((_b = response.json) === null || _b === void 0 ? void 0 : _b.message) || 'Failed to fetch messages';
                                    logger.error('Failed to fetch messages', { status: response.statusCode });
                                    reject(new Error(errorMsg));
                                    return;
                                }
                                if (!response.json) {
                                    reject(new Error('Invalid response from server'));
                                    return;
                                }
                                var data = response.json;
                                resolve(data);
                            },
                        });
                    })];
            });
        });
    };
    /** Mark messages as read via the API */
    ConversationsManager.prototype.markAsRead = function (ticketId) {
        return __awaiter(this, void 0, void 0, function () {
            var targetTicketId, token;
            var _this = this;
            return __generator(this, function (_a) {
                targetTicketId = ticketId || this._currentTicketId;
                if (!targetTicketId) {
                    throw new Error('No ticket ID provided and no active conversation');
                }
                // Switch to this ticket if explicitly provided
                this._switchToTicketIfNeeded(ticketId);
                token = this._config.token;
                logger.info('Marking messages as read', { ticketId: targetTicketId });
                // eslint-disable-next-line compat/compat
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this._posthog._send_request({
                            url: _this._posthog.requestRouter.endpointFor('api', "/api/conversations/v1/widget/messages/".concat(targetTicketId, "/read")),
                            method: 'POST',
                            data: {
                                widget_session_id: _this._widgetSessionId,
                            },
                            headers: {
                                'X-Conversations-Token': token,
                            },
                            callback: function (response) {
                                var _a, _b;
                                if (response.statusCode === 429) {
                                    reject(new Error('Too many requests. Please wait before trying again.'));
                                    return;
                                }
                                if (response.statusCode !== 200) {
                                    var errorMsg = ((_a = response.json) === null || _a === void 0 ? void 0 : _a.detail) || ((_b = response.json) === null || _b === void 0 ? void 0 : _b.message) || 'Failed to mark messages as read';
                                    logger.error('Failed to mark messages as read', { status: response.statusCode });
                                    reject(new Error(errorMsg));
                                    return;
                                }
                                if (!response.json) {
                                    reject(new Error('Invalid response from server'));
                                    return;
                                }
                                var data = response.json;
                                resolve(data);
                            },
                        });
                    })];
            });
        });
    };
    /**
     * Initialize the conversations manager.
     * Always initializes persistence and event listeners for API usage.
     * Only renders the widget if widgetEnabled is true AND domain is allowed.
     */
    ConversationsManager.prototype._initialize = function () {
        var _this = this;
        if (!globals_1.document || !globals_1.window) {
            logger.info('Conversations not available: Document or window not available');
            return;
        }
        var restoreToken = (0, url_utils_1.getRestoreTokenFromUrl)();
        if (restoreToken && !this._hasProcessedRestoreToken) {
            this._hasProcessedRestoreToken = true;
            // Clear the token from the URL immediately, then again after a tick and
            // after the restore completes.  SPA routers (Next.js, React Router, etc.)
            // maintain their own URL state and can overwrite a single replaceState call.
            (0, url_utils_1.clearRestoreTokenFromUrl)();
            setTimeout(url_utils_1.clearRestoreTokenFromUrl, 0);
            this._restoreFromTokenWithRetry(restoreToken)
                .catch(function (error) {
                logger.warn('Failed to restore conversations from URL token', error);
            })
                .finally(function () {
                (0, url_utils_1.clearRestoreTokenFromUrl)();
                _this._completeInitialization();
            });
            return;
        }
        this._completeInitialization();
    };
    ConversationsManager.prototype._completeInitialization = function () {
        this._hasProcessedRestoreToken = true;
        // Load any existing ticket ID from localStorage
        this._currentTicketId = this._persistence.loadTicketId();
        logger.info('Loaded ticket ID from storage', { ticketId: this._currentTicketId });
        // Track conversations API loaded (separate from widget loaded)
        this._posthog.capture('$conversations_loaded', {
            hasExistingTicket: !!this._currentTicketId,
            widgetEnabled: this._isWidgetEnabled,
            domainAllowed: this._isDomainAllowed,
        });
        // Only render widget if both widgetEnabled and domain is allowed
        if (this._isWidgetEnabled && this._isDomainAllowed) {
            this._initializeWidget();
        }
        else {
            logger.info('Widget not rendered', {
                widgetEnabled: this._isWidgetEnabled,
                domainAllowed: this._isDomainAllowed,
            });
        }
        // Listen for identify events to hide identification form when user identifies
        this._setupIdentifyListener();
    };
    ConversationsManager.prototype._restoreFromTokenWithRetry = function (restoreToken) {
        return __awaiter(this, void 0, void 0, function () {
            var error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 4]);
                        return [4 /*yield*/, this._restoreFromToken(restoreToken)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_2 = _a.sent();
                        logger.warn('Restore token exchange failed, retrying once', error_2);
                        return [4 /*yield*/, this._restoreFromToken(restoreToken)];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ConversationsManager.prototype._restoreFromToken = function (restoreToken) {
        return __awaiter(this, void 0, void 0, function () {
            var token, payload, data;
            var _this = this;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        token = this._config.token;
                        payload = {
                            restore_token: restoreToken,
                            widget_session_id: this._widgetSessionId,
                            distinct_id: this._posthog.get_distinct_id(),
                            current_url: (_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.location) === null || _a === void 0 ? void 0 : _a.href,
                        };
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                _this._posthog._send_request({
                                    url: _this._posthog.requestRouter.endpointFor('api', RESTORE_EXCHANGE_ENDPOINT),
                                    method: 'POST',
                                    data: payload,
                                    headers: {
                                        'X-Conversations-Token': token,
                                    },
                                    callback: function (response) {
                                        var _a, _b, _c;
                                        if (response.statusCode === 429) {
                                            reject(new Error('Too many requests. Please wait before trying again.'));
                                            return;
                                        }
                                        if (response.statusCode !== 200) {
                                            var errorMsg = ((_a = response.json) === null || _a === void 0 ? void 0 : _a.error) ||
                                                ((_b = response.json) === null || _b === void 0 ? void 0 : _b.detail) ||
                                                ((_c = response.json) === null || _c === void 0 ? void 0 : _c.message) ||
                                                'Failed to restore conversations';
                                            reject(new Error(errorMsg));
                                            return;
                                        }
                                        if (!response.json) {
                                            reject(new Error('Invalid response from server'));
                                            return;
                                        }
                                        resolve(response.json);
                                    },
                                });
                            })];
                    case 1:
                        data = _c.sent();
                        if (data.status !== 'success') {
                            logger.info('Restore token was not accepted', { status: data.status, code: data.code });
                            return [2 /*return*/, data];
                        }
                        this._lastMessageTimestamp = null;
                        this._unreadCount = 0;
                        // Apply the canonical widget_session_id from the server if provided
                        if (data.widget_session_id) {
                            this._widgetSessionId = data.widget_session_id;
                            this._persistence.setWidgetSessionId(data.widget_session_id);
                        }
                        if ((_b = data.migrated_ticket_ids) === null || _b === void 0 ? void 0 : _b.length) {
                            this._currentTicketId = data.migrated_ticket_ids[0];
                            this._persistence.saveTicketId(this._currentTicketId);
                            // Poll straight away so messages and ticket list are fresh
                            void this._pollMessages();
                            void this._pollTickets();
                        }
                        else {
                            this._currentTicketId = null;
                            this._persistence.clearTicketId();
                        }
                        return [2 /*return*/, data];
                }
            });
        });
    };
    /**
     * Initialize and render the widget UI
     * Uses a promise guard to prevent race conditions from concurrent calls
     */
    ConversationsManager.prototype._initializeWidget = function () {
        if (this._isWidgetRendered) {
            return Promise.resolve();
        }
        if (this._initializeWidgetPromise) {
            return this._initializeWidgetPromise;
        }
        this._initializeWidgetPromise = this._doInitializeWidget();
        return this._initializeWidgetPromise;
    };
    ConversationsManager.prototype._doInitializeWidget = function () {
        return __awaiter(this, void 0, void 0, function () {
            var savedState, initialState, initialUserTraits, _a, initialView, tickets;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        savedState = this._persistence.loadWidgetState();
                        initialState = savedState === 'open' ? 'open' : 'closed';
                        this._widgetState = initialState;
                        initialUserTraits = this._getInitialUserTraits();
                        return [4 /*yield*/, this._determineInitialView()];
                    case 1:
                        _a = _b.sent(), initialView = _a.view, tickets = _a.tickets;
                        this._currentView = initialView;
                        // Render the widget with initial view
                        this._renderWidget(initialState, initialUserTraits, initialView, tickets);
                        this._isWidgetRendered = true;
                        this._posthog.capture('$conversations_widget_loaded', {
                            hasExistingTicket: !!this._currentTicketId,
                            initialState: initialState,
                            initialView: initialView,
                            ticketCount: tickets.length,
                            hasUserTraits: !!initialUserTraits,
                        });
                        // Start polling — the first poll fires immediately and loads messages or tickets
                        this._startPolling();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Extract name and email from PostHog's stored person properties.
     *
     * Person properties set via posthog.identify() are stored under the
     * $stored_person_properties persistence key, not as top-level props.
     * We check both locations plus the super-properties for completeness.
     */
    ConversationsManager.prototype._getPersonTraits = function () {
        var _a;
        var superProps = ((_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.props) || {};
        var storedPersonProps = this._posthog.get_property(constants_1.STORED_PERSON_PROPERTIES_KEY) || {};
        var name = storedPersonProps.$name || storedPersonProps.name || superProps.$name || superProps.name || undefined;
        var email = storedPersonProps.$email || storedPersonProps.email || superProps.$email || superProps.email || undefined;
        return { name: name, email: email };
    };
    /**
     * Get initial user traits from PostHog or localStorage
     */
    ConversationsManager.prototype._getInitialUserTraits = function () {
        var _a = this._getPersonTraits(), name = _a.name, email = _a.email;
        if (name || email) {
            return {
                name: name || undefined,
                email: email || undefined,
            };
        }
        // Otherwise, check localStorage for previously saved traits
        var savedTraits = this._persistence.loadUserTraits();
        if (savedTraits && (savedTraits.name || savedTraits.email)) {
            return savedTraits;
        }
        return null;
    };
    /**
     * Mark messages as read
     */
    ConversationsManager.prototype._markMessagesAsRead = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_3;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this._currentTicketId) {
                            return [2 /*return*/];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.markAsRead(this._currentTicketId)];
                    case 2:
                        response = _b.sent();
                        this._unreadCount = response.unread_count;
                        // Update the widget to reflect the new unread count
                        (_a = this._widgetRef) === null || _a === void 0 ? void 0 : _a.setUnreadCount(0);
                        logger.info('Messages marked as read', { unreadCount: response.unread_count });
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _b.sent();
                        logger.error('Failed to mark messages as read', error_3);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Load messages for the current ticket
     */
    ConversationsManager.prototype._loadMessages = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, lastMessage, error_4;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this._currentTicketId) {
                            return [2 /*return*/];
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.getMessages(this._currentTicketId, this._lastMessageTimestamp || undefined)
                            // Update unread count from response
                        ];
                    case 2:
                        response = _c.sent();
                        // Update unread count from response
                        if ((0, core_1.isNumber)(response.unread_count)) {
                            this._unreadCount = response.unread_count;
                            (_a = this._widgetRef) === null || _a === void 0 ? void 0 : _a.setUnreadCount(response.unread_count);
                            // If widget is open and there are unread messages, mark them as read
                            if (response.unread_count > 0 && this._isWidgetOpen()) {
                                this._markMessagesAsRead();
                            }
                        }
                        if (response.messages.length > 0) {
                            (_b = this._widgetRef) === null || _b === void 0 ? void 0 : _b.addMessages(response.messages);
                            lastMessage = response.messages[response.messages.length - 1];
                            this._lastMessageTimestamp = lastMessage.created_at;
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_4 = _c.sent();
                        logger.error('Failed to load messages', error_4);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ConversationsManager.prototype._isWidgetOpen = function () {
        return this._widgetState === 'open';
    };
    /**
     * Load tickets list from API
     */
    ConversationsManager.prototype._loadTickets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, totalUnread, error_5;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getTickets()];
                    case 1:
                        response = _c.sent();
                        this._tickets = response.results;
                        this._hasMultipleTickets = response.results.length > 1;
                        (_a = this._widgetRef) === null || _a === void 0 ? void 0 : _a.updateTickets(response.results);
                        totalUnread = response.results.reduce(function (sum, t) { return sum + (t.unread_count || 0); }, 0);
                        this._unreadCount = totalUnread;
                        (_b = this._widgetRef) === null || _b === void 0 ? void 0 : _b.setUnreadCount(totalUnread);
                        logger.info('Tickets loaded', { count: response.results.length, totalUnread: totalUnread });
                        return [3 /*break*/, 3];
                    case 2:
                        error_5 = _c.sent();
                        logger.error('Failed to load tickets', error_5);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Determine initial view based on ticket count
     */
    ConversationsManager.prototype._determineInitialView = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, totalUnread, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getTickets()];
                    case 1:
                        response = _a.sent();
                        this._tickets = response.results;
                        this._hasMultipleTickets = response.results.length > 1;
                        totalUnread = response.results.reduce(function (sum, t) { return sum + (t.unread_count || 0); }, 0);
                        this._unreadCount = totalUnread;
                        // If 2+ tickets, show ticket list; otherwise show messages
                        if (response.results.length >= 2) {
                            return [2 /*return*/, { view: 'tickets', tickets: response.results }];
                        }
                        // If exactly 1 ticket, set it as current
                        if (response.results.length === 1) {
                            this._currentTicketId = response.results[0].id;
                            this._persistence.saveTicketId(response.results[0].id);
                        }
                        return [2 /*return*/, { view: 'messages', tickets: response.results }];
                    case 2:
                        error_6 = _a.sent();
                        logger.error('Failed to determine initial view', error_6);
                        return [2 /*return*/, { view: 'messages', tickets: [] }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Start polling based on current view
     */
    ConversationsManager.prototype._startPolling = function () {
        var _this = this;
        if (this._pollIntervalId) {
            return; // Already polling
        }
        // Poll immediately
        this._poll();
        // Set up interval
        this._pollIntervalId = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.setInterval(function () {
            _this._poll();
        }, POLL_INTERVAL_MS);
        logger.info('Started polling', { view: this._currentView });
    };
    /**
     * Stop polling for new messages
     */
    ConversationsManager.prototype._stopPolling = function () {
        if (this._pollIntervalId) {
            globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.clearInterval(this._pollIntervalId);
            this._pollIntervalId = null;
            logger.info('Stopped polling for messages');
        }
    };
    /**
     * Setup listener for identify events.
     * When user calls posthog.identify(), hide the identification form
     * since we now know who they are.
     */
    ConversationsManager.prototype._setupIdentifyListener = function () {
        var _this = this;
        this._unsubscribeIdentifyListener = this._posthog.on('eventCaptured', function (event) {
            var _a;
            if (event.event === '$identify') {
                // User just identified - hide the identification form if it's showing
                (_a = _this._widgetRef) === null || _a === void 0 ? void 0 : _a.setUserIdentified();
            }
        });
    };
    /**
     * Show the widget (render it to DOM).
     * The widget respects its saved state (open/closed).
     * Note: Domain restrictions still apply - widget won't render on disallowed domains.
     */
    ConversationsManager.prototype.show = function () {
        // Check domain restrictions - don't render on disallowed domains
        if (!this._isDomainAllowed) {
            logger.warn('Cannot show widget: current domain is not allowed');
            return;
        }
        // If widget isn't rendered yet, render it now
        if (!this._isWidgetRendered) {
            this._initializeWidget();
        }
    };
    /**
     * Hide and remove the widget from the DOM.
     * Conversation data is preserved - call show() to re-render.
     */
    ConversationsManager.prototype.hide = function () {
        // Stop polling when widget is hidden (save resources)
        this._stopPolling();
        if (this._containerElement) {
            (0, preact_1.render)(null, this._containerElement);
            this._containerElement.remove();
            this._containerElement = null;
        }
        this._widgetRef = null;
        this._isWidgetRendered = false;
        this._initializeWidgetPromise = null;
        // Reset timestamp so show() will re-fetch all messages
        this._lastMessageTimestamp = null;
    };
    /**
     * Check if the widget is currently visible (rendered in DOM)
     */
    ConversationsManager.prototype.isVisible = function () {
        return this._isWidgetRendered;
    };
    /** Get tickets list for the current widget session */
    ConversationsManager.prototype.getTickets = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var token, queryParams;
            var _this = this;
            var _a, _b;
            return __generator(this, function (_c) {
                token = this._config.token;
                queryParams = {
                    widget_session_id: this._widgetSessionId,
                    limit: String((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 20),
                    offset: String((_b = options === null || options === void 0 ? void 0 : options.offset) !== null && _b !== void 0 ? _b : 0),
                };
                if (options === null || options === void 0 ? void 0 : options.status) {
                    queryParams.status = options.status;
                }
                // eslint-disable-next-line compat/compat
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this._posthog._send_request({
                            url: _this._posthog.requestRouter.endpointFor('api', "/api/conversations/v1/widget/tickets?".concat((0, request_utils_1.formDataToQuery)(queryParams))),
                            method: 'GET',
                            headers: {
                                'X-Conversations-Token': token,
                            },
                            callback: function (response) {
                                var _a, _b;
                                if (response.statusCode === 429) {
                                    reject(new Error('Too many requests. Please wait before trying again.'));
                                    return;
                                }
                                if (response.statusCode !== 200) {
                                    var errorMsg = ((_a = response.json) === null || _a === void 0 ? void 0 : _a.detail) || ((_b = response.json) === null || _b === void 0 ? void 0 : _b.message) || 'Failed to fetch tickets';
                                    logger.error('Failed to fetch tickets', { status: response.statusCode });
                                    reject(new Error(errorMsg));
                                    return;
                                }
                                if (!response.json) {
                                    reject(new Error('Invalid response from server'));
                                    return;
                                }
                                var data = response.json;
                                resolve(data);
                            },
                        });
                    })];
            });
        });
    };
    ConversationsManager.prototype.requestRestoreLink = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedEmail, token, payload;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                normalizedEmail = email.trim().toLowerCase();
                if (!normalizedEmail) {
                    throw new Error('Email is required');
                }
                token = this._config.token;
                payload = {
                    email: normalizedEmail,
                    request_url: ((_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.location) === null || _a === void 0 ? void 0 : _a.href) || '',
                };
                // eslint-disable-next-line compat/compat
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this._posthog._send_request({
                            url: _this._posthog.requestRouter.endpointFor('api', RESTORE_REQUEST_ENDPOINT),
                            method: 'POST',
                            data: payload,
                            headers: {
                                'X-Conversations-Token': token,
                            },
                            callback: function (response) {
                                var _a, _b, _c;
                                if (response.statusCode === 429) {
                                    reject(new Error('Too many requests. Please wait before trying again.'));
                                    return;
                                }
                                if (response.statusCode !== 200) {
                                    var errorMsg = ((_a = response.json) === null || _a === void 0 ? void 0 : _a.error) ||
                                        ((_b = response.json) === null || _b === void 0 ? void 0 : _b.detail) ||
                                        ((_c = response.json) === null || _c === void 0 ? void 0 : _c.message) ||
                                        'Failed to request restore link';
                                    reject(new Error(errorMsg));
                                    return;
                                }
                                resolve({ ok: true });
                            },
                        });
                    })];
            });
        });
    };
    ConversationsManager.prototype.restoreFromToken = function (restoreToken) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedToken;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        normalizedToken = restoreToken.trim();
                        if (!normalizedToken) {
                            throw new Error('Restore token is required');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, this._restoreFromTokenWithRetry(normalizedToken)];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        (0, url_utils_1.clearRestoreTokenFromUrl)();
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ConversationsManager.prototype.restoreFromUrlToken = function () {
        return __awaiter(this, void 0, void 0, function () {
            var restoreToken;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        restoreToken = (0, url_utils_1.getRestoreTokenFromUrl)();
                        if (!restoreToken) {
                            return [2 /*return*/, null];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, this.restoreFromToken(restoreToken)];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        (0, url_utils_1.clearRestoreTokenFromUrl)();
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get the current active ticket ID
     * Returns null if no conversation has been started yet
     */
    ConversationsManager.prototype.getCurrentTicketId = function () {
        return this._currentTicketId;
    };
    /**
     * Get the widget session ID (persistent browser identifier)
     * This ID is used for access control and stays the same across page loads
     */
    ConversationsManager.prototype.getWidgetSessionId = function () {
        return this._widgetSessionId;
    };
    /**
     * Clean up the widget
     */
    ConversationsManager.prototype.destroy = function () {
        this._stopPolling();
        // Unsubscribe from identify events
        if (this._unsubscribeIdentifyListener) {
            this._unsubscribeIdentifyListener();
            this._unsubscribeIdentifyListener = null;
        }
        if (this._containerElement) {
            (0, preact_1.render)(null, this._containerElement);
            this._containerElement.remove();
            this._containerElement = null;
        }
        this._widgetRef = null;
        if (_activeManager === this) {
            _activeManager = null;
        }
        logger.info('Widget destroyed');
    };
    /**
     * Reset all conversation data and destroy the widget.
     * Called on posthog.reset() to start fresh.
     */
    ConversationsManager.prototype.reset = function () {
        // Clear all persisted conversation data
        this._persistence.clearAll();
        // Reset local state
        this._currentTicketId = null;
        this._lastMessageTimestamp = null;
        this._unreadCount = 0;
        // Destroy the widget
        this.destroy();
        logger.info('Conversations reset');
    };
    /**
     * Render the widget to the DOM
     */
    ConversationsManager.prototype._renderWidget = function (initialState, initialUserTraits, initialView, initialTickets) {
        var _this = this;
        if (initialView === void 0) { initialView = 'messages'; }
        if (initialTickets === void 0) { initialTickets = []; }
        if (!globals_1.document) {
            logger.info('Conversations widget not rendered: Document not available');
            return;
        }
        // Create container if it doesn't exist
        var container = globals_1.document.getElementById(WIDGET_CONTAINER_ID);
        if (!container) {
            if (!globals_1.document.body) {
                logger.info('Conversations widget not rendered: Document body not available yet');
                return;
            }
            container = globals_1.document.createElement('div');
            container.id = WIDGET_CONTAINER_ID;
            globals_1.document.body.appendChild(container);
        }
        this._containerElement = container;
        // Render widget with ref
        (0, preact_1.render)((0, jsx_runtime_1.jsx)(ConversationsWidget_1.ConversationsWidget, { ref: function (ref) {
                _this._widgetRef = ref;
            }, config: this._config, initialState: initialState, initialUserTraits: initialUserTraits, isUserIdentified: this._posthog._isIdentified(), initialView: initialView, initialTickets: initialTickets, hasMultipleTickets: this._hasMultipleTickets, onSendMessage: this._handleSendMessage, onStateChange: this._handleStateChange, onIdentify: this._handleIdentify, onRequestRestoreLink: this._handleRequestRestoreLink, onSelectTicket: this._handleSelectTicket, onNewConversation: this._handleNewConversation, onBackToTickets: this._handleBackToTickets, onViewChange: this._handleViewChange }), container);
    };
    return ConversationsManager;
}());
exports.ConversationsManager = ConversationsManager;
/**
 * Initialize the conversations widget.
 * This is the entry point called from the lazy-loaded bundle.
 *
 * Singleton guard: only one ConversationsManager per page. The toolbar's
 * internal PostHog instance is excluded upstream (see loadIfEnabled), so
 * this always belongs to the customer's main instance.
 */
function initConversations(config, posthog) {
    if (_activeManager) {
        return _activeManager;
    }
    _activeManager = new ConversationsManager(config, posthog);
    return _activeManager;
}
//# sourceMappingURL=index.js.map