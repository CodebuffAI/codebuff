"use strict";
// Inline styles following PostHog design system
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
exports.getStyles = void 0;
var constants_1 = require("../../../../constants");
/**
 * Calculate contrasting text color (black or white) based on background brightness
 * Uses HSP (Highly Sensitive Purity) brightness formula
 */
function getContrastTextColor(hexColor) {
    var hex = hexColor.replace(/^#/, '');
    var fullHex = hex.length === 3 ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex;
    var r = parseInt(fullHex.slice(0, 2), 16);
    var g = parseInt(fullHex.slice(2, 4), 16);
    var b = parseInt(fullHex.slice(4, 6), 16);
    // HSP brightness formula
    var hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp > 127.5 ? '#020617' : 'white';
}
var getStyles = function (primaryColor, position) {
    if (position === void 0) { position = 'bottom_right'; }
    var isLeft = position.includes('left');
    var isTop = position.includes('top');
    return {
        widget: __assign(__assign(__assign({ position: 'fixed' }, (isTop ? { top: '20px' } : { bottom: '20px' })), (isLeft ? { left: '20px' } : { right: '20px' })), { zIndex: constants_1.Z_INDEX_CONVERSATIONS, fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", Helvetica, Arial, sans-serif' }),
        buttonContainer: {
            position: 'relative',
        },
        button: {
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: primaryColor,
            color: getContrastTextColor(primaryColor),
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
        },
        unreadBadge: __assign(__assign(__assign({ position: 'absolute' }, (isTop ? { bottom: '-4px' } : { top: '-4px' })), (isLeft ? { left: '-4px' } : { right: '-4px' })), { minWidth: '20px', height: '20px', borderRadius: '10px', background: '#ef4444', color: 'white', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', border: '2px solid white', boxSizing: 'border-box' }),
        window: __assign(__assign(__assign({ position: 'absolute' }, (isTop ? { top: 0 } : { bottom: 0 })), (isLeft ? { left: 0 } : { right: 0 })), { background: 'white', borderRadius: '10px', boxShadow: '0 10px 25px -3px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
            //border: '1px solid #dcdcdc',
            border: 'none' }),
        windowOpen: {
            width: '400px',
            maxWidth: 'calc(100vw - 40px)',
            height: '600px',
            maxHeight: 'calc(100vh - 100px)',
        },
        header: {
            background: primaryColor,
            color: getContrastTextColor(primaryColor),
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
        },
        headerTitle: {
            fontWeight: 500,
            fontSize: '14px',
        },
        headerActions: {
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
        },
        headerLinkButton: {
            background: 'transparent',
            border: 'none',
            color: getContrastTextColor(primaryColor),
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            opacity: 0.9,
        },
        headerButton: {
            background: 'transparent',
            border: 'none',
            color: getContrastTextColor(primaryColor),
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: '16px',
            lineHeight: 1,
            borderRadius: '4px',
            transition: 'background 0.2s ease-out',
            opacity: 0.9,
        },
        messages: {
            flex: 1,
            overflowY: 'auto',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'white',
        },
        message: {
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '85%',
            animation: 'fadeIn 0.2s ease-out',
        },
        messageCustomer: {
            alignSelf: 'flex-end',
            alignItems: 'flex-end',
        },
        messageAgent: {
            alignSelf: 'flex-start',
            alignItems: 'flex-start',
        },
        messageAuthor: {
            fontSize: '10px',
            color: '#939393',
            marginBottom: '4px',
            fontWeight: 500,
        },
        messageContent: {
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            lineHeight: 1.5,
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap',
        },
        messageContentCustomer: {
            background: primaryColor,
            color: getContrastTextColor(primaryColor),
            borderBottomRightRadius: '2px',
        },
        messageContentAgent: {
            background: 'white',
            color: '#020617',
            border: '1.5px solid #dcdcdc',
            borderBottomLeftRadius: '2px',
        },
        messageTime: {
            fontSize: '10px',
            color: '#939393',
            marginTop: '4px',
            opacity: 0.8,
        },
        error: {
            padding: '10px 16px',
            background: '#fee2e2',
            color: '#991b1b',
            fontSize: '13px',
            borderTop: '1px solid #fecaca',
            borderBottom: '1px solid #fecaca',
            textAlign: 'center',
            fontWeight: 500,
        },
        inputContainer: {
            padding: '8px 12px',
            background: 'white',
            borderTop: '1px solid #dcdcdc',
            display: 'flex',
            gap: '8px',
            alignItems: 'center', // Changed from flex-end to center to vertically align input and sendButton
            flexShrink: 0,
        },
        input: {
            flex: 1,
            maxHeight: '120px',
            fontSize: '14px',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            color: '#020617',
            background: 'white',
            border: 'none',
            outline: 'none',
            transition: 'border-color 0.2s ease-out, box-shadow 0.2s ease-out',
            display: 'flex',
            alignItems: 'center',
            fieldSizing: 'content',
        },
        sendButton: {
            width: '33px',
            height: '33px', // Match input minHeight for vertical alignment
            borderRadius: '10px',
            background: primaryColor,
            color: getContrastTextColor(primaryColor),
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease-out',
            boxShadow: '0 2px 0 rgba(0, 0, 0, 0.045)',
            fontWeight: 700,
            flexShrink: 0,
        },
        // Identification form styles
        identificationForm: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            background: '#eeeded',
            overflowY: 'auto',
        },
        formTitle: {
            fontSize: '18px',
            fontWeight: 600,
            color: '#020617',
            marginBottom: '8px',
        },
        formDescription: {
            fontSize: '14px',
            color: '#64748b',
            marginBottom: '24px',
            lineHeight: 1.5,
        },
        recoverFooter: {
            padding: '10px 14px',
            borderTop: '1px solid #e5e7eb',
            fontSize: '12px',
            color: '#64748b',
            lineHeight: 1.5,
            flexShrink: 0,
            textAlign: 'center',
        },
        recoverFooterLink: {
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: 'inherit',
            textDecoration: 'underline',
        },
        formField: {
            marginBottom: '16px',
        },
        formLabel: {
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            color: '#020617',
            marginBottom: '6px',
        },
        formInput: {
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #dcdcdc',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'inherit',
            color: '#020617',
            background: 'white',
            transition: 'border-color 0.2s ease-out, box-shadow 0.2s ease-out',
            boxSizing: 'border-box',
        },
        formInputError: {
            borderColor: '#ef4444',
        },
        formError: {
            fontSize: '12px',
            color: '#ef4444',
            marginTop: '4px',
        },
        formSubmitButton: {
            width: '100%',
            padding: '12px 16px',
            borderRadius: '6px',
            background: primaryColor,
            color: getContrastTextColor(primaryColor),
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.2s ease-out',
            marginTop: '8px',
        },
        formOptional: {
            fontSize: '12px',
            color: '#939393',
            fontWeight: 400,
        },
        restoreRequestSuccess: {
            marginTop: '12px',
            fontSize: '12px',
            color: '#166534',
            background: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '6px',
            padding: '10px 12px',
            lineHeight: 1.4,
        },
        // Ticket list styles
        ticketListContainer: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'white',
            overflowY: 'auto',
        },
        ticketList: {
            flex: 1,
            overflowY: 'auto',
        },
        ticketItem: {
            padding: '14px 16px',
            borderBottom: '1px solid #f1f1f1',
            cursor: 'pointer',
            transition: 'background 0.15s ease-out',
            background: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
        },
        ticketItemUnread: {
            background: '#fafafa',
        },
        ticketItemContent: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            flex: 1,
            minWidth: 0, // Allow text truncation
        },
        ticketItemArrow: {
            color: '#939393',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
        },
        ticketItemHeader: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '8px',
        },
        ticketPreview: {
            fontSize: '13px',
            color: '#020617',
            lineHeight: 1.4,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
        },
        ticketPreviewUnread: {
            fontSize: '13px',
            color: '#020617',
            lineHeight: 1.4,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
        },
        ticketUnreadBadge: {
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            background: '#ef4444',
            color: 'white',
            fontSize: '10px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            flexShrink: 0,
        },
        ticketMeta: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        },
        ticketTime: {
            fontSize: '11px',
            color: '#939393',
        },
        ticketStatus: {
            fontSize: '10px',
            color: '#64748b',
            background: '#f1f5f9',
            padding: '2px 6px',
            borderRadius: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
        },
        newConversationButton: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '12px 16px',
            padding: '10px 16px',
            borderRadius: '8px',
            background: primaryColor,
            color: getContrastTextColor(primaryColor),
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s ease-out',
        },
        // Ticket list loading state
        ticketListLoading: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: '#64748b',
            fontSize: '13px',
        },
        loadingSpinner: {
            width: '24px',
            height: '24px',
            border: '2px solid #e2e8f0',
            borderTop: "2px solid ".concat(primaryColor),
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        },
        // Ticket list empty state
        ticketListEmpty: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            textAlign: 'center',
        },
        emptyStateIcon: {
            color: '#cbd5e1',
            marginBottom: '16px',
        },
        emptyStateTitle: {
            fontSize: '16px',
            fontWeight: 600,
            color: '#020617',
            marginBottom: '8px',
        },
        emptyStateDescription: {
            fontSize: '13px',
            color: '#64748b',
            lineHeight: 1.5,
            marginBottom: '20px',
        },
        newConversationButtonLarge: {
            padding: '12px 24px',
            borderRadius: '8px',
            background: primaryColor,
            color: getContrastTextColor(primaryColor),
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.2s ease-out',
        },
        fetchPreviousButton: {
            marginTop: '10px',
            background: 'transparent',
            border: 'none',
            color: primaryColor,
            cursor: 'pointer',
            fontSize: '13px',
            textDecoration: 'underline',
            opacity: 1,
        },
        // Back button for message view header
        backButton: {
            background: 'transparent',
            border: 'none',
            color: getContrastTextColor(primaryColor),
            cursor: 'pointer',
            padding: '6px 0px',
            marginRight: '4px',
            fontSize: '16px',
            lineHeight: 1,
            borderRadius: '4px',
            transition: 'background 0.2s ease-out',
            opacity: 0.9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        },
        // Header with back button layout
        headerWithBack: {
            display: 'flex',
            alignItems: 'center',
        },
    };
};
exports.getStyles = getStyles;
//# sourceMappingURL=styles.js.map