"use strict";
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
exports.TicketListView = void 0;
var jsx_runtime_1 = require("preact/jsx-runtime");
var TicketListItem_1 = require("./TicketListItem");
/**
 * Loading state component
 */
var LoadingState = function (_a) {
    var styles = _a.styles;
    return ((0, jsx_runtime_1.jsxs)("div", { style: styles.ticketListLoading, children: [(0, jsx_runtime_1.jsx)("div", { style: styles.loadingSpinner }), (0, jsx_runtime_1.jsx)("span", { children: "Loading conversations..." })] }));
};
/**
 * Empty state component when there are no tickets
 */
var EmptyState = function (_a) {
    var styles = _a.styles, onNewConversation = _a.onNewConversation, onOpenRestoreRequest = _a.onOpenRestoreRequest;
    return ((0, jsx_runtime_1.jsxs)("div", { style: styles.ticketListEmpty, children: [(0, jsx_runtime_1.jsx)("div", { style: styles.emptyStateIcon, children: (0, jsx_runtime_1.jsx)("svg", { width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: (0, jsx_runtime_1.jsx)("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) }) }), (0, jsx_runtime_1.jsx)("div", { style: styles.emptyStateTitle, children: "No conversations yet" }), (0, jsx_runtime_1.jsx)("div", { style: styles.emptyStateDescription, children: "Start a new conversation to get help from our team." }), (0, jsx_runtime_1.jsx)("button", { style: styles.newConversationButtonLarge, onClick: onNewConversation, onMouseEnter: function (e) {
                    e.currentTarget.style.opacity = '0.9';
                }, onMouseLeave: function (e) {
                    e.currentTarget.style.opacity = '1';
                }, children: "Start a conversation" }), (0, jsx_runtime_1.jsx)("button", { style: styles.fetchPreviousButton, onClick: onOpenRestoreRequest, onMouseEnter: function (e) {
                    e.currentTarget.style.opacity = '0.8';
                }, onMouseLeave: function (e) {
                    e.currentTarget.style.opacity = '1';
                }, children: "Fetch previous conversations" })] }));
};
/**
 * Ticket list view showing all user's tickets
 */
var TicketListView = function (_a) {
    var tickets = _a.tickets, isLoading = _a.isLoading, styles = _a.styles, onSelectTicket = _a.onSelectTicket, onNewConversation = _a.onNewConversation, onOpenRestoreRequest = _a.onOpenRestoreRequest;
    // Show loading state
    if (isLoading && tickets.length === 0) {
        return (0, jsx_runtime_1.jsx)(LoadingState, { styles: styles });
    }
    // Show empty state when no tickets
    if (tickets.length === 0) {
        return ((0, jsx_runtime_1.jsx)(EmptyState, { styles: styles, onNewConversation: onNewConversation, onOpenRestoreRequest: onOpenRestoreRequest }));
    }
    // Show ticket list
    return ((0, jsx_runtime_1.jsxs)("div", { style: styles.ticketListContainer, children: [(0, jsx_runtime_1.jsx)("div", { style: styles.ticketList, children: __spreadArray([], __read(tickets), false).sort(function (a, b) {
                    var dateA = new Date(a.last_message_at || a.created_at).getTime();
                    var dateB = new Date(b.last_message_at || b.created_at).getTime();
                    return dateB - dateA; // Descending order (newest first)
                })
                    .map(function (ticket) { return ((0, jsx_runtime_1.jsx)(TicketListItem_1.TicketListItem, { ticket: ticket, styles: styles, onClick: onSelectTicket }, "".concat(ticket.id, "-").concat(ticket.last_message_at || ticket.created_at, "-").concat(ticket.unread_count))); }) }), (0, jsx_runtime_1.jsxs)("button", { style: styles.newConversationButton, onClick: onNewConversation, onMouseEnter: function (e) {
                    e.currentTarget.style.opacity = '0.9';
                }, onMouseLeave: function (e) {
                    e.currentTarget.style.opacity = '1';
                }, children: [(0, jsx_runtime_1.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", style: { marginRight: '8px' }, children: [(0, jsx_runtime_1.jsx)("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), (0, jsx_runtime_1.jsx)("line", { x1: "5", y1: "12", x2: "19", y2: "12" })] }), "New conversation"] })] }));
};
exports.TicketListView = TicketListView;
//# sourceMappingURL=TicketListView.js.map