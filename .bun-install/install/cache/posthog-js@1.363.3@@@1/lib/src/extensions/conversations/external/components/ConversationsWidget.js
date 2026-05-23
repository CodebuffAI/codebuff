"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationsWidget = void 0;
var jsx_runtime_1 = require("preact/jsx-runtime");
// eslint-disable-next-line @typescript-eslint/no-unused-vars
var preact_1 = require("preact");
var logger_1 = require("../../../../utils/logger");
var styles_1 = require("./styles");
var OpenChatButton_1 = require("./OpenChatButton");
var CloseChatButton_1 = require("./CloseChatButton");
var TicketListView_1 = require("./TicketListView");
var IdentificationFormView_1 = require("./IdentificationFormView");
var RestoreRequestView_1 = require("./RestoreRequestView");
var MessagesView_1 = require("./MessagesView");
var logger = (0, logger_1.createLogger)('[ConversationsWidget]');
var ConversationsWidget = /** @class */ (function (_super) {
    __extends(ConversationsWidget, _super);
    function ConversationsWidget(props) {
        var _this = _super.call(this, props) || this;
        _this._messagesEndRef = null;
        _this._inputRef = null;
        _this._handleToggleOpen = function () {
            _this.setState(function (prevState) { return ({
                state: prevState.state === 'open' ? 'closed' : 'open',
            }); });
        };
        _this._handleClose = function () {
            _this.setState({ state: 'closed' });
        };
        _this._handleSelectTicket = function (ticketId) {
            if (_this.props.onSelectTicket) {
                _this.props.onSelectTicket(ticketId);
            }
        };
        _this._handleNewConversation = function () {
            if (_this.props.onNewConversation) {
                _this.props.onNewConversation();
            }
        };
        _this._handleBackToTickets = function () {
            if (_this.props.onBackToTickets) {
                _this.props.onBackToTickets();
            }
        };
        _this._handleOpenRestoreRequest = function () {
            _this.setState(function (prevState) {
                var _a;
                return ({
                    view: 'restore_request',
                    restoreEmail: prevState.restoreEmail || ((_a = prevState.userTraits) === null || _a === void 0 ? void 0 : _a.email) || '',
                    restoreEmailError: null,
                    restoreRequestSuccess: false,
                });
            });
            if (_this.props.onViewChange) {
                _this.props.onViewChange('restore_request');
            }
        };
        _this._handleCloseRestoreRequest = function () {
            var returnView = _this.state.hasMultipleTickets ? 'tickets' : 'messages';
            _this.setState({ view: returnView, restoreEmailError: null, restoreRequestSuccess: false });
            if (_this.props.onViewChange) {
                _this.props.onViewChange(returnView);
            }
        };
        _this._handleInputChange = function (e) {
            var target = e.target;
            _this.setState({ inputValue: target.value });
        };
        _this._handleKeyPress = function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                _this._handleSendMessage();
            }
        };
        // Identification form handlers
        _this._handleFormNameChange = function (e) {
            var target = e.target;
            _this.setState({ formName: target.value });
        };
        _this._handleFormEmailChange = function (e) {
            var target = e.target;
            _this.setState({ formEmail: target.value, formEmailError: null });
        };
        _this._handleRestoreEmailChange = function (e) {
            var target = e.target;
            _this.setState({
                restoreEmail: target.value,
                restoreEmailError: null,
                restoreRequestSuccess: false,
            });
        };
        _this._handleFormSubmit = function (e) {
            e.preventDefault();
            var _a = _this.state, formEmail = _a.formEmail, formName = _a.formName;
            var _b = _this.props, config = _b.config, onIdentify = _b.onIdentify;
            // Validate email if required
            if (config.requireEmail && !formEmail.trim()) {
                _this.setState({ formEmailError: 'Email is required' });
                return;
            }
            if (formEmail.trim() && !_this._validateEmail(formEmail.trim())) {
                _this.setState({ formEmailError: 'Please enter a valid email address' });
                return;
            }
            // Create traits object
            var traits = {};
            if (formName.trim()) {
                traits.name = formName.trim();
            }
            if (formEmail.trim()) {
                traits.email = formEmail.trim();
            }
            // Navigate to appropriate view after identification
            var nextView = _this.state.hasMultipleTickets ? 'tickets' : 'messages';
            // Update state and notify parent
            _this.setState({
                userTraits: traits,
                view: nextView,
            });
            if (onIdentify) {
                onIdentify(traits);
            }
            if (_this.props.onViewChange) {
                _this.props.onViewChange(nextView);
            }
        };
        _this._handleRestoreRequestSubmit = function (e) { return __awaiter(_this, void 0, void 0, function () {
            var email, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        e.preventDefault();
                        if (!this.props.onRequestRestoreLink) {
                            return [2 /*return*/];
                        }
                        email = this.state.restoreEmail.trim();
                        if (!email) {
                            this.setState({ restoreEmailError: 'Email is required' });
                            return [2 /*return*/];
                        }
                        if (!this._validateEmail(email)) {
                            this.setState({ restoreEmailError: 'Please enter a valid email address' });
                            return [2 /*return*/];
                        }
                        this.setState({
                            restoreRequestLoading: true,
                            restoreEmailError: null,
                        });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.props.onRequestRestoreLink(email)];
                    case 2:
                        _a.sent();
                        this.setState({
                            restoreRequestLoading: false,
                            restoreRequestSuccess: true,
                        });
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        logger.error('Failed to request restore link', error_1);
                        this.setState({
                            restoreRequestLoading: false,
                            restoreEmailError: error_1 instanceof Error ? error_1.message : 'Failed to request restore link',
                        });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        _this._handleSendMessage = function () { return __awaiter(_this, void 0, void 0, function () {
            var inputValue, trimmedMessage, userMessage, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        inputValue = this.state.inputValue;
                        trimmedMessage = inputValue.trim();
                        if (!trimmedMessage) {
                            return [2 /*return*/];
                        }
                        userMessage = {
                            id: "temp-".concat(Date.now()),
                            content: trimmedMessage,
                            author_type: 'customer',
                            author_name: 'You',
                            created_at: new Date().toISOString(),
                            is_private: false,
                        };
                        this.setState({
                            messages: __spreadArray(__spreadArray([], __read(this.state.messages), false), [userMessage], false),
                            inputValue: '',
                            isLoading: true,
                            error: null,
                        });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.props.onSendMessage(trimmedMessage)
                            // Success - message will be updated via addMessage()
                        ];
                    case 2:
                        _a.sent();
                        // Success - message will be updated via addMessage()
                        this.setState({ isLoading: false });
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        logger.error('Failed to send message', error_2);
                        this.setState(function (prevState) { return ({
                            isLoading: false,
                            error: error_2 instanceof Error ? error_2.message : 'Failed to send message',
                            messages: prevState.messages.filter(function (m) { return m.id !== userMessage.id; }),
                        }); });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        // Determine if we need to show the identification form
        var userTraits = props.initialUserTraits || null;
        var needsIdentification = _this._needsIdentification(props.config, userTraits, props.isUserIdentified);
        // If identification is needed, start with that view; otherwise use the provided initial view
        var initialView = needsIdentification ? 'identification' : props.initialView || 'messages';
        _this.state = {
            state: props.initialState || 'closed',
            view: initialView,
            messages: [],
            tickets: props.initialTickets || [],
            ticketsLoading: false,
            inputValue: '',
            isLoading: false,
            error: null,
            formName: (userTraits === null || userTraits === void 0 ? void 0 : userTraits.name) || '',
            formEmail: (userTraits === null || userTraits === void 0 ? void 0 : userTraits.email) || '',
            formEmailError: null,
            userTraits: userTraits,
            unreadCount: 0,
            hasMultipleTickets: props.hasMultipleTickets || false,
            restoreEmail: (userTraits === null || userTraits === void 0 ? void 0 : userTraits.email) || '',
            restoreEmailError: null,
            restoreRequestLoading: false,
            restoreRequestSuccess: false,
        };
        return _this;
    }
    /**
     * Check if we need to show the identification form
     */
    ConversationsWidget.prototype._needsIdentification = function (config, traits, isUserIdentified) {
        // If user is already identified via PostHog, no form needed
        // They've called posthog.identify() so we have their identity
        if (isUserIdentified) {
            return false;
        }
        // If requireEmail is not set, no identification needed
        if (!config.requireEmail) {
            return false;
        }
        // If we already have an email, no form needed
        if (traits === null || traits === void 0 ? void 0 : traits.email) {
            return false;
        }
        return true;
    };
    ConversationsWidget.prototype.componentDidMount = function () {
        // Add greeting message if no messages exist and we're in message view
        if (this.state.view === 'messages' && this.state.messages.length === 0 && this.props.config.greetingText) {
            this._addGreetingMessage();
        }
    };
    ConversationsWidget.prototype.componentDidUpdate = function (_prevProps, prevState) {
        // Scroll to bottom when messages change
        if (this.state.messages.length !== prevState.messages.length) {
            this._scrollToBottom();
        }
        // Notify parent of state changes
        if (this.state.state !== prevState.state && this.props.onStateChange) {
            this.props.onStateChange(this.state.state);
        }
        // Focus input and scroll to bottom when opening
        if (this.state.state === 'open' && prevState.state !== 'open') {
            this._focusInput();
            this._scrollToBottom();
        }
    };
    ConversationsWidget.prototype._addGreetingMessage = function () {
        var greetingMessage = {
            id: 'greeting',
            content: this.props.config.greetingText || 'Hi! How can we help?',
            author_type: 'AI',
            author_name: 'Support',
            created_at: new Date().toISOString(),
            is_private: false,
        };
        this.setState({ messages: [greetingMessage] });
    };
    ConversationsWidget.prototype._scrollToBottom = function () {
        if (this._messagesEndRef) {
            this._messagesEndRef.scrollIntoView({ behavior: 'smooth' });
        }
    };
    ConversationsWidget.prototype._focusInput = function () {
        if (this._inputRef) {
            this._inputRef.focus();
        }
    };
    ConversationsWidget.prototype._validateEmail = function (email) {
        // Basic email validation
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };
    /**
     * Public method to add messages from outside
     */
    ConversationsWidget.prototype.addMessages = function (messages) {
        this.setState(function (prevState) {
            // Filter out duplicates
            var existingIds = new Set(prevState.messages.map(function (m) { return m.id; }));
            var newMessages = messages.filter(function (m) { return !existingIds.has(m.id); });
            if (newMessages.length > 0) {
                return {
                    messages: __spreadArray(__spreadArray([], __read(prevState.messages), false), __read(newMessages), false),
                };
            }
            return null;
        });
    };
    /**
     * Public method to show the widget
     */
    ConversationsWidget.prototype.show = function () {
        this.setState({ state: 'open' });
    };
    /**
     * Public method to hide the widget
     */
    ConversationsWidget.prototype.hide = function () {
        this.setState({ state: 'closed' });
    };
    /**
     * Get user traits (either provided via form or from props)
     */
    ConversationsWidget.prototype.getUserTraits = function () {
        return this.state.userTraits;
    };
    /**
     * Called when user identifies via posthog.identify()
     * Navigates away from identification form since we now know who they are
     */
    ConversationsWidget.prototype.setUserIdentified = function () {
        if (this.state.view === 'identification') {
            var nextView = this.state.hasMultipleTickets ? 'tickets' : 'messages';
            this.setState({ view: nextView });
            if (this.props.onViewChange) {
                this.props.onViewChange(nextView);
            }
        }
    };
    /**
     * Set the unread message count (called by manager)
     */
    ConversationsWidget.prototype.setUnreadCount = function (count) {
        this.setState({ unreadCount: count });
    };
    /**
     * Update the tickets list (called by manager during polling)
     */
    ConversationsWidget.prototype.updateTickets = function (tickets) {
        this.setState({
            tickets: tickets,
            ticketsLoading: false,
            hasMultipleTickets: tickets.length > 1,
        });
    };
    /**
     * Set the current view (tickets list or messages)
     */
    ConversationsWidget.prototype.setView = function (view) {
        this.setState({ view: view });
        if (this.props.onViewChange) {
            this.props.onViewChange(view);
        }
    };
    /**
     * Get the current view
     */
    ConversationsWidget.prototype.getView = function () {
        return this.state.view;
    };
    /**
     * Set tickets loading state
     */
    ConversationsWidget.prototype.setTicketsLoading = function (loading) {
        this.setState({ ticketsLoading: loading });
    };
    /**
     * Clear messages (used when switching tickets or starting new conversation)
     * @param addGreeting - If true, adds the greeting message after clearing
     */
    ConversationsWidget.prototype.clearMessages = function (addGreeting) {
        var _this = this;
        if (addGreeting === void 0) { addGreeting = false; }
        this.setState({ messages: [] }, function () {
            if (addGreeting && _this.props.config.greetingText) {
                _this._addGreetingMessage();
            }
        });
    };
    ConversationsWidget.prototype._renderIdentificationForm = function (styles) {
        return ((0, jsx_runtime_1.jsx)(IdentificationFormView_1.IdentificationFormView, { config: this.props.config, styles: styles, formName: this.state.formName, formEmail: this.state.formEmail, formEmailError: this.state.formEmailError, onNameChange: this._handleFormNameChange, onEmailChange: this._handleFormEmailChange, onSubmit: this._handleFormSubmit }));
    };
    ConversationsWidget.prototype._renderBackButton = function (styles) {
        var onClick = this.state.view === 'restore_request' ? this._handleCloseRestoreRequest : this._handleBackToTickets;
        return ((0, jsx_runtime_1.jsx)("button", { style: styles.backButton, onClick: onClick, "aria-label": "Back to conversations", children: (0, jsx_runtime_1.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: (0, jsx_runtime_1.jsx)("polyline", { points: "15 18 9 12 15 6" }) }) }));
    };
    ConversationsWidget.prototype._renderTicketList = function (styles) {
        var _a = this.state, tickets = _a.tickets, ticketsLoading = _a.ticketsLoading;
        return ((0, jsx_runtime_1.jsx)(TicketListView_1.TicketListView, { tickets: tickets, isLoading: ticketsLoading, styles: styles, onSelectTicket: this._handleSelectTicket, onNewConversation: this._handleNewConversation, onOpenRestoreRequest: this._handleOpenRestoreRequest }));
    };
    ConversationsWidget.prototype._renderMessages = function (styles, primaryColor, placeholderText) {
        var _this = this;
        return ((0, jsx_runtime_1.jsx)(MessagesView_1.MessagesView, { styles: styles, primaryColor: primaryColor, placeholderText: placeholderText, messages: this.state.messages, inputValue: this.state.inputValue, isLoading: this.state.isLoading, error: this.state.error, onInputChange: this._handleInputChange, onKeyDown: this._handleKeyPress, onSendMessage: this._handleSendMessage, messagesEndRef: function (el) {
                _this._messagesEndRef = el;
            }, inputRef: function (el) {
                _this._inputRef = el;
            } }));
    };
    ConversationsWidget.prototype._renderRestoreRequestView = function (styles) {
        return ((0, jsx_runtime_1.jsx)(RestoreRequestView_1.RestoreRequestView, { styles: styles, restoreEmail: this.state.restoreEmail, restoreEmailError: this.state.restoreEmailError, restoreRequestLoading: this.state.restoreRequestLoading, restoreRequestSuccess: this.state.restoreRequestSuccess, onEmailChange: this._handleRestoreEmailChange, onSubmit: this._handleRestoreRequestSubmit }));
    };
    /**
     * Get the title for the current view
     */
    ConversationsWidget.prototype._getTitle = function (view) {
        switch (view) {
            case 'tickets':
                return 'Conversations';
            case 'restore_request':
                return 'Restore conversations';
            case 'identification':
                return 'Support Chat';
            case 'messages':
                return 'Support Chat';
        }
    };
    /**
     * Render the content for the current view
     */
    ConversationsWidget.prototype._renderViewContent = function (styles, primaryColor, placeholderText) {
        switch (this.state.view) {
            case 'identification':
                return this._renderIdentificationForm(styles);
            case 'restore_request':
                return this._renderRestoreRequestView(styles);
            case 'tickets':
                return this._renderTicketList(styles);
            case 'messages':
                return this._renderMessages(styles, primaryColor, placeholderText);
        }
    };
    ConversationsWidget.prototype.render = function () {
        var config = this.props.config;
        var _a = this.state, state = _a.state, view = _a.view;
        var primaryColor = config.color || '#5375ff';
        var widgetPosition = config.widgetPosition || 'bottom_right';
        var placeholderText = config.placeholderText || 'Type your message...';
        var styles = (0, styles_1.getStyles)(primaryColor, widgetPosition);
        // Button only (closed state)
        if (state === 'closed') {
            return ((0, jsx_runtime_1.jsx)(OpenChatButton_1.OpenChatButton, { primaryColor: primaryColor, position: widgetPosition, handleToggleOpen: this._handleToggleOpen, unreadCount: this.state.unreadCount }));
        }
        // Open state
        var windowStyle = __assign(__assign({}, styles.window), styles.windowOpen);
        // Show back button in message view when there are multiple tickets or in restore request view
        var showBackButton = (view === 'messages' && this.state.hasMultipleTickets) || view === 'restore_request';
        // Show recover footer only in tickets and messages views
        var showRecoverFooter = view === 'tickets' || view === 'messages';
        return ((0, jsx_runtime_1.jsx)("div", { style: styles.widget, children: (0, jsx_runtime_1.jsxs)("div", { style: windowStyle, children: [(0, jsx_runtime_1.jsxs)("div", { style: styles.header, children: [(0, jsx_runtime_1.jsxs)("div", { style: showBackButton ? styles.headerWithBack : styles.headerTitle, children: [showBackButton && this._renderBackButton(styles), (0, jsx_runtime_1.jsx)("span", { style: styles.headerTitle, children: this._getTitle(view) })] }), (0, jsx_runtime_1.jsx)("div", { style: styles.headerActions, children: (0, jsx_runtime_1.jsx)(CloseChatButton_1.CloseChatButton, { primaryColor: primaryColor, handleClose: this._handleClose }) })] }), this._renderViewContent(styles, primaryColor, placeholderText), showRecoverFooter && ((0, jsx_runtime_1.jsxs)("div", { style: styles.recoverFooter, children: ["Don't see your previous tickets?", ' ', (0, jsx_runtime_1.jsx)("button", { type: "button", style: styles.recoverFooterLink, onClick: this._handleOpenRestoreRequest, children: "Recover them here" })] }))] }) }));
    };
    return ConversationsWidget;
}(preact_1.Component));
exports.ConversationsWidget = ConversationsWidget;
//# sourceMappingURL=ConversationsWidget.js.map