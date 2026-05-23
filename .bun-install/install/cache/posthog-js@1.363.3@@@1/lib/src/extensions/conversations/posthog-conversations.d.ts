import { PostHog } from '../../posthog-core';
import { GetMessagesResponse, GetTicketsOptions, GetTicketsResponse, MarkAsReadResponse, RestoreFromTokenResponse, RequestRestoreLinkResponse, SendMessageResponse, UserProvidedTraits } from '../../posthog-conversations-types';
import { RemoteConfig } from '../../types';
import { LazyLoadedConversationsInterface } from '../../utils/globals';
import { Extension } from '../types';
export type ConversationsManager = LazyLoadedConversationsInterface;
export declare class PostHogConversations implements Extension {
    private _instance;
    private _isConversationsEnabled?;
    private _conversationsManager;
    private _isInitializing;
    private _remoteConfig;
    constructor(_instance: PostHog);
    initialize(): void;
    onRemoteConfig(response: RemoteConfig): void;
    reset(): void;
    loadIfEnabled(): void;
    /** Helper to finalize conversations initialization */
    private _completeInitialization;
    /** Helper to handle initialization errors */
    private _handleLoadError;
    /**
     * Show the conversations widget (button and chat panel)
     */
    show(): void;
    /**
     * Hide the conversations widget completely (button and chat panel)
     */
    hide(): void;
    /**
     * Check if conversations are available (enabled in remote config AND loaded)
     * Use this to check if conversations API can be used.
     */
    isAvailable(): boolean;
    /**
     * Check if the widget is currently visible (rendered and shown)
     */
    isVisible(): boolean;
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
    sendMessage(message: string, userTraits?: UserProvidedTraits, newTicket?: boolean): Promise<SendMessageResponse | null>;
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
    getMessages(ticketId?: string, after?: string): Promise<GetMessagesResponse | null>;
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
    markAsRead(ticketId?: string): Promise<MarkAsReadResponse | null>;
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
    getTickets(options?: GetTicketsOptions): Promise<GetTicketsResponse | null>;
    /**
     * Request a restore link email for previous conversations.
     *
     * @param email - Email address associated with previous conversations
     * @returns Promise with generic success response or null if conversations unavailable
     */
    requestRestoreLink(email: string): Promise<RequestRestoreLinkResponse | null>;
    /**
     * Redeem a restore token and relink eligible tickets to this browser session.
     *
     * @param restoreToken - Opaque restore token from restore email link
     * @returns Promise with restore status or null if conversations unavailable
     */
    restoreFromToken(restoreToken: string): Promise<RestoreFromTokenResponse | null>;
    /**
     * Parse and redeem `ph_conv_restore` token from the current URL.
     *
     * @returns Promise with restore status, or null when no token/conversations unavailable
     */
    restoreFromUrlToken(): Promise<RestoreFromTokenResponse | null>;
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
    getCurrentTicketId(): string | null;
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
    getWidgetSessionId(): string | null;
}
