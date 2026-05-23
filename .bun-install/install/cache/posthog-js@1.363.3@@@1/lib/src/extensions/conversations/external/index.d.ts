import { ConversationsRemoteConfig, UserProvidedTraits, SendMessageResponse, GetMessagesResponse, MarkAsReadResponse, GetTicketsOptions, GetTicketsResponse, RestoreFromTokenResponse, RequestRestoreLinkResponse } from '../../../posthog-conversations-types';
import { PostHog } from '../../../posthog-core';
import { ConversationsManager as ConversationsManagerInterface } from '../posthog-conversations';
export declare class ConversationsManager implements ConversationsManagerInterface {
    private readonly _posthog;
    private _config;
    private _persistence;
    private _widgetRef;
    private _containerElement;
    private _currentTicketId;
    private _pollIntervalId;
    private _lastMessageTimestamp;
    private _isPollingMessages;
    private _isPollingTickets;
    private _unsubscribeIdentifyListener;
    private _unreadCount;
    private _widgetSessionId;
    private _isWidgetEnabled;
    private _isDomainAllowed;
    private _widgetState;
    private _isWidgetRendered;
    private _hasProcessedRestoreToken;
    private _initializeWidgetPromise;
    private _currentView;
    private _tickets;
    private _hasMultipleTickets;
    constructor(config: ConversationsRemoteConfig, _posthog: PostHog);
    /**
     * Send a message programmatically via the API
     * Creates a new ticket if none exists or if newTicket is true
     *
     * @param message - The message text to send
     * @param userTraits - Optional user identification data (name, email)
     * @param newTicket - If true, forces creation of a new ticket (ignores current ticket)
     * @returns Promise with the response including ticket_id and message_id
     */
    sendMessage(message: string, userTraits?: UserProvidedTraits, newTicket?: boolean): Promise<SendMessageResponse>;
    /**
     * Switch to a different ticket if an explicit ticketId is provided
     * This ensures subsequent operations (sendMessage, etc.) use the correct ticket
     */
    private _switchToTicketIfNeeded;
    /** Fetch messages via the API */
    getMessages(ticketId?: string, after?: string): Promise<GetMessagesResponse>;
    /** Mark messages as read via the API */
    markAsRead(ticketId?: string): Promise<MarkAsReadResponse>;
    /**
     * Initialize the conversations manager.
     * Always initializes persistence and event listeners for API usage.
     * Only renders the widget if widgetEnabled is true AND domain is allowed.
     */
    private _initialize;
    private _completeInitialization;
    private _restoreFromTokenWithRetry;
    private _restoreFromToken;
    /**
     * Initialize and render the widget UI
     * Uses a promise guard to prevent race conditions from concurrent calls
     */
    private _initializeWidget;
    private _doInitializeWidget;
    /**
     * Extract name and email from PostHog's stored person properties.
     *
     * Person properties set via posthog.identify() are stored under the
     * $stored_person_properties persistence key, not as top-level props.
     * We check both locations plus the super-properties for completeness.
     */
    private _getPersonTraits;
    /**
     * Get initial user traits from PostHog or localStorage
     */
    private _getInitialUserTraits;
    /**
     * Handle user identification from the widget form
     */
    private _handleIdentify;
    private _handleRequestRestoreLink;
    /**
     * Handle sending a message from the widget
     */
    private _handleSendMessage;
    /**
     * Handle widget state changes
     */
    private _handleStateChange;
    /**
     * Mark messages as read
     */
    private _markMessagesAsRead;
    /**
     * Load messages for the current ticket
     */
    private _loadMessages;
    private _isWidgetOpen;
    /**
     * Poll for new messages
     */
    private _pollMessages;
    /**
     * Poll for tickets list
     */
    private _pollTickets;
    /**
     * Load tickets list from API
     */
    private _loadTickets;
    /**
     * Main poll function that polls based on current view
     */
    private _poll;
    /**
     * Handle view changes from the widget
     */
    private _handleViewChange;
    /**
     * Handle ticket selection from the list
     */
    private _handleSelectTicket;
    /**
     * Handle new conversation request
     */
    private _handleNewConversation;
    /**
     * Handle back to tickets request
     */
    private _handleBackToTickets;
    /**
     * Determine initial view based on ticket count
     */
    private _determineInitialView;
    /**
     * Start polling based on current view
     */
    private _startPolling;
    /**
     * Stop polling for new messages
     */
    private _stopPolling;
    /**
     * Setup listener for identify events.
     * When user calls posthog.identify(), hide the identification form
     * since we now know who they are.
     */
    private _setupIdentifyListener;
    /**
     * Show the widget (render it to DOM).
     * The widget respects its saved state (open/closed).
     * Note: Domain restrictions still apply - widget won't render on disallowed domains.
     */
    show(): void;
    /**
     * Hide and remove the widget from the DOM.
     * Conversation data is preserved - call show() to re-render.
     */
    hide(): void;
    /**
     * Check if the widget is currently visible (rendered in DOM)
     */
    isVisible(): boolean;
    /** Get tickets list for the current widget session */
    getTickets(options?: GetTicketsOptions): Promise<GetTicketsResponse>;
    requestRestoreLink(email: string): Promise<RequestRestoreLinkResponse>;
    restoreFromToken(restoreToken: string): Promise<RestoreFromTokenResponse>;
    restoreFromUrlToken(): Promise<RestoreFromTokenResponse | null>;
    /**
     * Get the current active ticket ID
     * Returns null if no conversation has been started yet
     */
    getCurrentTicketId(): string | null;
    /**
     * Get the widget session ID (persistent browser identifier)
     * This ID is used for access control and stays the same across page loads
     */
    getWidgetSessionId(): string;
    /**
     * Clean up the widget
     */
    destroy(): void;
    /**
     * Reset all conversation data and destroy the widget.
     * Called on posthog.reset() to start fresh.
     */
    reset(): void;
    /**
     * Render the widget to the DOM
     */
    private _renderWidget;
}
/**
 * Initialize the conversations widget.
 * This is the entry point called from the lazy-loaded bundle.
 *
 * Singleton guard: only one ConversationsManager per page. The toolbar's
 * internal PostHog instance is excluded upstream (see loadIfEnabled), so
 * this always belongs to the customer's main instance.
 */
export declare function initConversations(config: ConversationsRemoteConfig, posthog: PostHog): ConversationsManager;
