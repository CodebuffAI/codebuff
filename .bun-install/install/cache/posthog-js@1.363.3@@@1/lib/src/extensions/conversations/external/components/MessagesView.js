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
exports.MessagesView = MessagesView;
var jsx_runtime_1 = require("preact/jsx-runtime");
var SendMessageButton_1 = require("./SendMessageButton");
var RichContent_1 = require("./RichContent");
var utils_1 = require("./utils");
function MessageBubble(_a) {
    var message = _a.message, styles = _a.styles, primaryColor = _a.primaryColor;
    var isCustomer = message.author_type === 'customer';
    var messageStyle = __assign(__assign({}, styles.message), (isCustomer ? styles.messageCustomer : styles.messageAgent));
    var contentStyle = __assign(__assign({}, styles.messageContent), (isCustomer ? styles.messageContentCustomer : styles.messageContentAgent));
    return ((0, jsx_runtime_1.jsxs)("div", { style: messageStyle, children: [!isCustomer && message.author_name && (0, jsx_runtime_1.jsx)("div", { style: styles.messageAuthor, children: message.author_name }), (0, jsx_runtime_1.jsx)("div", { style: contentStyle, children: (0, jsx_runtime_1.jsx)(RichContent_1.RichContent, { richContent: message.rich_content, content: message.content, isCustomer: isCustomer, primaryColor: primaryColor }) }), (0, jsx_runtime_1.jsx)("div", { style: styles.messageTime, children: (0, utils_1.formatRelativeTime)(message.created_at) })] }, message.id));
}
function MessagesView(_a) {
    var styles = _a.styles, primaryColor = _a.primaryColor, placeholderText = _a.placeholderText, messages = _a.messages, inputValue = _a.inputValue, isLoading = _a.isLoading, error = _a.error, onInputChange = _a.onInputChange, onKeyDown = _a.onKeyDown, onSendMessage = _a.onSendMessage, messagesEndRef = _a.messagesEndRef, inputRef = _a.inputRef;
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { style: styles.messages, children: [messages.map(function (message) { return ((0, jsx_runtime_1.jsx)(MessageBubble, { message: message, styles: styles, primaryColor: primaryColor }, message.id)); }), (0, jsx_runtime_1.jsx)("div", { ref: messagesEndRef })] }), error && (0, jsx_runtime_1.jsx)("div", { style: styles.error, children: error }), (0, jsx_runtime_1.jsxs)("div", { style: styles.inputContainer, children: [(0, jsx_runtime_1.jsx)("textarea", { ref: inputRef, style: styles.input, placeholder: placeholderText, value: inputValue, onInput: onInputChange, onKeyDown: onKeyDown, rows: 1, disabled: isLoading }), (0, jsx_runtime_1.jsx)(SendMessageButton_1.SendMessageButton, { primaryColor: primaryColor, inputValue: inputValue, isLoading: isLoading, handleSendMessage: onSendMessage })] })] }));
}
//# sourceMappingURL=MessagesView.js.map