import type { WidgetPosition } from '../../../../posthog-conversations-types';
export declare const getStyles: (primaryColor: string, position?: WidgetPosition) => {
    widget: {
        zIndex: number;
        fontFamily: string;
        left: string;
        top: string;
        position: "fixed";
    } | {
        zIndex: number;
        fontFamily: string;
        right: string;
        top: string;
        position: "fixed";
    } | {
        zIndex: number;
        fontFamily: string;
        left: string;
        bottom: string;
        position: "fixed";
    } | {
        zIndex: number;
        fontFamily: string;
        right: string;
        bottom: string;
        position: "fixed";
    };
    buttonContainer: {
        position: "relative";
    };
    button: {
        width: string;
        height: string;
        borderRadius: string;
        background: string;
        color: string;
        border: string;
        cursor: string;
        boxShadow: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        transition: string;
    };
    unreadBadge: {
        minWidth: string;
        height: string;
        borderRadius: string;
        background: string;
        color: string;
        fontSize: string;
        fontWeight: number;
        display: string;
        alignItems: string;
        justifyContent: string;
        padding: string;
        boxShadow: string;
        border: string;
        boxSizing: "border-box";
        left: string;
        bottom: string;
        position: "absolute";
    } | {
        minWidth: string;
        height: string;
        borderRadius: string;
        background: string;
        color: string;
        fontSize: string;
        fontWeight: number;
        display: string;
        alignItems: string;
        justifyContent: string;
        padding: string;
        boxShadow: string;
        border: string;
        boxSizing: "border-box";
        right: string;
        bottom: string;
        position: "absolute";
    } | {
        minWidth: string;
        height: string;
        borderRadius: string;
        background: string;
        color: string;
        fontSize: string;
        fontWeight: number;
        display: string;
        alignItems: string;
        justifyContent: string;
        padding: string;
        boxShadow: string;
        border: string;
        boxSizing: "border-box";
        left: string;
        top: string;
        position: "absolute";
    } | {
        minWidth: string;
        height: string;
        borderRadius: string;
        background: string;
        color: string;
        fontSize: string;
        fontWeight: number;
        display: string;
        alignItems: string;
        justifyContent: string;
        padding: string;
        boxShadow: string;
        border: string;
        boxSizing: "border-box";
        right: string;
        top: string;
        position: "absolute";
    };
    window: {
        background: string;
        borderRadius: string;
        boxShadow: string;
        display: string;
        flexDirection: "column";
        overflow: string;
        transition: string;
        border: string;
        left: number;
        top: number;
        position: "absolute";
    } | {
        background: string;
        borderRadius: string;
        boxShadow: string;
        display: string;
        flexDirection: "column";
        overflow: string;
        transition: string;
        border: string;
        right: number;
        top: number;
        position: "absolute";
    } | {
        background: string;
        borderRadius: string;
        boxShadow: string;
        display: string;
        flexDirection: "column";
        overflow: string;
        transition: string;
        border: string;
        left: number;
        bottom: number;
        position: "absolute";
    } | {
        background: string;
        borderRadius: string;
        boxShadow: string;
        display: string;
        flexDirection: "column";
        overflow: string;
        transition: string;
        border: string;
        right: number;
        bottom: number;
        position: "absolute";
    };
    windowOpen: {
        width: string;
        maxWidth: string;
        height: string;
        maxHeight: string;
    };
    header: {
        background: string;
        color: string;
        padding: string;
        display: string;
        justifyContent: string;
        alignItems: string;
        flexShrink: number;
    };
    headerTitle: {
        fontWeight: number;
        fontSize: string;
    };
    headerActions: {
        display: string;
        gap: string;
        alignItems: string;
    };
    headerLinkButton: {
        background: string;
        border: string;
        color: string;
        cursor: string;
        padding: string;
        fontSize: string;
        borderRadius: string;
        opacity: number;
    };
    headerButton: {
        background: string;
        border: string;
        color: string;
        cursor: string;
        padding: string;
        fontSize: string;
        lineHeight: number;
        borderRadius: string;
        transition: string;
        opacity: number;
    };
    messages: {
        flex: number;
        overflowY: "auto";
        padding: string;
        display: string;
        flexDirection: "column";
        gap: string;
        background: string;
    };
    message: {
        display: string;
        flexDirection: "column";
        maxWidth: string;
        animation: string;
    };
    messageCustomer: {
        alignSelf: string;
        alignItems: string;
    };
    messageAgent: {
        alignSelf: string;
        alignItems: string;
    };
    messageAuthor: {
        fontSize: string;
        color: string;
        marginBottom: string;
        fontWeight: number;
    };
    messageContent: {
        padding: string;
        borderRadius: string;
        fontSize: string;
        lineHeight: number;
        wordWrap: "break-word";
        whiteSpace: "pre-wrap";
    };
    messageContentCustomer: {
        background: string;
        color: string;
        borderBottomRightRadius: string;
    };
    messageContentAgent: {
        background: string;
        color: string;
        border: string;
        borderBottomLeftRadius: string;
    };
    messageTime: {
        fontSize: string;
        color: string;
        marginTop: string;
        opacity: number;
    };
    error: {
        padding: string;
        background: string;
        color: string;
        fontSize: string;
        borderTop: string;
        borderBottom: string;
        textAlign: "center";
        fontWeight: number;
    };
    inputContainer: {
        padding: string;
        background: string;
        borderTop: string;
        display: string;
        gap: string;
        alignItems: string;
        flexShrink: number;
    };
    input: {
        flex: number;
        maxHeight: string;
        fontSize: string;
        resize: string;
        fontFamily: string;
        lineHeight: number;
        color: string;
        background: string;
        border: string;
        outline: string;
        transition: string;
        display: string;
        alignItems: string;
        fieldSizing: string;
    };
    sendButton: {
        width: string;
        height: string;
        borderRadius: string;
        background: string;
        color: string;
        border: string;
        cursor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        transition: string;
        boxShadow: string;
        fontWeight: number;
        flexShrink: number;
    };
    identificationForm: {
        flex: number;
        display: string;
        flexDirection: "column";
        padding: string;
        background: string;
        overflowY: "auto";
    };
    formTitle: {
        fontSize: string;
        fontWeight: number;
        color: string;
        marginBottom: string;
    };
    formDescription: {
        fontSize: string;
        color: string;
        marginBottom: string;
        lineHeight: number;
    };
    recoverFooter: {
        padding: string;
        borderTop: string;
        fontSize: string;
        color: string;
        lineHeight: number;
        flexShrink: number;
        textAlign: string;
    };
    recoverFooterLink: {
        background: string;
        border: string;
        padding: number;
        color: string;
        cursor: string;
        fontSize: string;
        fontFamily: string;
        textDecoration: string;
    };
    formField: {
        marginBottom: string;
    };
    formLabel: {
        display: string;
        fontSize: string;
        fontWeight: number;
        color: string;
        marginBottom: string;
    };
    formInput: {
        width: string;
        padding: string;
        border: string;
        borderRadius: string;
        fontSize: string;
        fontFamily: string;
        color: string;
        background: string;
        transition: string;
        boxSizing: "border-box";
    };
    formInputError: {
        borderColor: string;
    };
    formError: {
        fontSize: string;
        color: string;
        marginTop: string;
    };
    formSubmitButton: {
        width: string;
        padding: string;
        borderRadius: string;
        background: string;
        color: string;
        border: string;
        cursor: string;
        fontSize: string;
        fontWeight: number;
        transition: string;
        marginTop: string;
    };
    formOptional: {
        fontSize: string;
        color: string;
        fontWeight: number;
    };
    restoreRequestSuccess: {
        marginTop: string;
        fontSize: string;
        color: string;
        background: string;
        border: string;
        borderRadius: string;
        padding: string;
        lineHeight: number;
    };
    ticketListContainer: {
        flex: number;
        display: string;
        flexDirection: "column";
        background: string;
        overflowY: "auto";
    };
    ticketList: {
        flex: number;
        overflowY: "auto";
    };
    ticketItem: {
        padding: string;
        borderBottom: string;
        cursor: string;
        transition: string;
        background: string;
        display: string;
        alignItems: string;
        gap: string;
    };
    ticketItemUnread: {
        background: string;
    };
    ticketItemContent: {
        display: string;
        flexDirection: "column";
        gap: string;
        flex: number;
        minWidth: number;
    };
    ticketItemArrow: {
        color: string;
        flexShrink: number;
        display: string;
        alignItems: string;
    };
    ticketItemHeader: {
        display: string;
        justifyContent: string;
        alignItems: string;
        gap: string;
    };
    ticketPreview: {
        fontSize: string;
        color: string;
        lineHeight: number;
        flex: number;
        overflow: string;
        textOverflow: string;
        whiteSpace: "nowrap";
    };
    ticketPreviewUnread: {
        fontSize: string;
        color: string;
        lineHeight: number;
        flex: number;
        overflow: string;
        textOverflow: string;
        whiteSpace: "nowrap";
        fontWeight: number;
    };
    ticketUnreadBadge: {
        minWidth: string;
        height: string;
        borderRadius: string;
        background: string;
        color: string;
        fontSize: string;
        fontWeight: number;
        display: string;
        alignItems: string;
        justifyContent: string;
        padding: string;
        flexShrink: number;
    };
    ticketMeta: {
        display: string;
        alignItems: string;
        gap: string;
    };
    ticketTime: {
        fontSize: string;
        color: string;
    };
    ticketStatus: {
        fontSize: string;
        color: string;
        background: string;
        padding: string;
        borderRadius: string;
        textTransform: "uppercase";
        letterSpacing: string;
    };
    newConversationButton: {
        display: string;
        alignItems: string;
        justifyContent: string;
        margin: string;
        padding: string;
        borderRadius: string;
        background: string;
        color: string;
        border: string;
        cursor: string;
        fontSize: string;
        fontWeight: number;
        transition: string;
    };
    ticketListLoading: {
        flex: number;
        display: string;
        flexDirection: "column";
        alignItems: string;
        justifyContent: string;
        gap: string;
        color: string;
        fontSize: string;
    };
    loadingSpinner: {
        width: string;
        height: string;
        border: string;
        borderTop: string;
        borderRadius: string;
        animation: string;
    };
    ticketListEmpty: {
        flex: number;
        display: string;
        flexDirection: "column";
        alignItems: string;
        justifyContent: string;
        padding: string;
        textAlign: "center";
    };
    emptyStateIcon: {
        color: string;
        marginBottom: string;
    };
    emptyStateTitle: {
        fontSize: string;
        fontWeight: number;
        color: string;
        marginBottom: string;
    };
    emptyStateDescription: {
        fontSize: string;
        color: string;
        lineHeight: number;
        marginBottom: string;
    };
    newConversationButtonLarge: {
        padding: string;
        borderRadius: string;
        background: string;
        color: string;
        border: string;
        cursor: string;
        fontSize: string;
        fontWeight: number;
        transition: string;
    };
    fetchPreviousButton: {
        marginTop: string;
        background: string;
        border: string;
        color: string;
        cursor: string;
        fontSize: string;
        textDecoration: string;
        opacity: number;
    };
    backButton: {
        background: string;
        border: string;
        color: string;
        cursor: string;
        padding: string;
        marginRight: string;
        fontSize: string;
        lineHeight: number;
        borderRadius: string;
        transition: string;
        opacity: number;
        display: string;
        alignItems: string;
        justifyContent: string;
    };
    headerWithBack: {
        display: string;
        alignItems: string;
    };
};
