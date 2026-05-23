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
exports.TicketListItem = void 0;
var jsx_runtime_1 = require("preact/jsx-runtime");
var utils_1 = require("./utils");
/**
 * Get a human-readable status label
 * Matches the display logic in PostHog main app
 */
function getStatusLabel(status) {
    if (status === 'on_hold') {
        return 'On hold';
    }
    // Capitalize first letter: 'new' -> 'New', 'open' -> 'Open', etc.
    return status.charAt(0).toUpperCase() + status.slice(1);
}
/**
 * A single ticket item in the ticket list
 */
var TicketListItem = function (_a) {
    var ticket = _a.ticket, styles = _a.styles, onClick = _a.onClick;
    var hasUnread = (ticket.unread_count || 0) > 0;
    var statusLabel = getStatusLabel(ticket.status);
    var handleClick = function () {
        onClick(ticket.id);
    };
    var itemStyle = __assign(__assign({}, styles.ticketItem), (hasUnread ? styles.ticketItemUnread : {}));
    return ((0, jsx_runtime_1.jsxs)("div", { style: itemStyle, onClick: handleClick, onKeyDown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
            }
        }, role: "button", tabIndex: 0, children: [(0, jsx_runtime_1.jsxs)("div", { style: styles.ticketItemContent, children: [(0, jsx_runtime_1.jsxs)("div", { style: styles.ticketItemHeader, children: [(0, jsx_runtime_1.jsx)("span", { style: hasUnread ? styles.ticketPreviewUnread : styles.ticketPreview, children: (0, utils_1.truncateText)((0, utils_1.stripMarkdown)(ticket.last_message), 60) }), hasUnread && (0, jsx_runtime_1.jsx)("span", { style: styles.ticketUnreadBadge, children: ticket.unread_count })] }), (0, jsx_runtime_1.jsxs)("div", { style: styles.ticketMeta, children: [(0, jsx_runtime_1.jsx)("span", { style: styles.ticketTime, children: (0, utils_1.formatRelativeTime)(ticket.last_message_at || ticket.created_at) }), (0, jsx_runtime_1.jsx)("span", { style: styles.ticketStatus, children: statusLabel })] })] }), (0, jsx_runtime_1.jsx)("div", { style: styles.ticketItemArrow, children: (0, jsx_runtime_1.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: (0, jsx_runtime_1.jsx)("polyline", { points: "9 18 15 12 9 6" }) }) })] }));
};
exports.TicketListItem = TicketListItem;
//# sourceMappingURL=TicketListItem.js.map