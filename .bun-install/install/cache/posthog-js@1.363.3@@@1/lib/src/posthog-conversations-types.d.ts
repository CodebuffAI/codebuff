/**
 * Position of the widget on the screen
 */
export type WidgetPosition = 'bottom_left' | 'bottom_right' | 'top_left' | 'top_right';
/**
 * Remote configuration for conversations from the PostHog server
 */
export interface ConversationsRemoteConfig {
    /**
     * Whether conversations are enabled for this team
     * When true, the conversations API is available (posthog.conversations.*)
     */
    enabled: boolean;
    /**
     * Whether the widget UI (button + chat panel) should be shown
     * Only takes effect when enabled is true
     * @default false
     */
    widgetEnabled?: boolean;
    /**
     * Public token for authenticating conversations API requests
     * This token is team-scoped and meant to be embedded in client code
     */
    token: string;
    /**
     * Greeting text to show when widget is first opened
     */
    greetingText?: string;
    /**
     * Primary color for the widget UI
     */
    color?: string;
    /**
     * Placeholder text for the message input
     */
    placeholderText?: string;
    /**
     * Whether to require email before starting a conversation
     * @default false
     */
    requireEmail?: boolean;
    /**
     * Whether to show the name field in the identification form
     * @default true (when requireEmail is true)
     */
    collectName?: boolean;
    /**
     * Title for the identification form
     * @default "Before we start..."
     */
    identificationFormTitle?: string;
    /**
     * Description for the identification form
     * @default "Please provide your details so we can help you better."
     */
    identificationFormDescription?: string;
    /**
     * List of allowed domains where the widget should be shown.
     * Supports wildcards like "https://*.example.com"
     * Empty array or not present means show on all domains.
     */
    domains?: string[];
    /**
     * Position of the widget on the screen
     * @default 'bottom_right'
     */
    widgetPosition?: WidgetPosition;
}
/**
 * Author types for messages in a conversation
 */
export type MessageAuthorType = 'customer' | 'AI' | 'human';
/**
 * TipTap mark types for inline formatting
 */
export interface TipTapMark {
    type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link';
    attrs?: {
        href?: string;
        target?: string;
        [key: string]: unknown;
    };
}
/**
 * TipTap node representing content in the document tree
 */
export interface TipTapNode {
    type: string;
    attrs?: Record<string, unknown>;
    content?: TipTapNode[];
    marks?: TipTapMark[];
    text?: string;
}
/**
 * TipTap document - the root node of rich content
 */
export interface TipTapDoc {
    type: 'doc';
    content?: TipTapNode[];
}
/**
 * A message in a conversation
 */
export interface Message {
    /**
     * Unique identifier for the message
     */
    id: string;
    /**
     * The message content as plain text (fallback)
     */
    content: string;
    /**
     * Rich content in TipTap JSON format (preferred for rendering)
     * Falls back to `content` if missing or invalid
     */
    rich_content?: TipTapDoc;
    /**
     * Type of the message author
     */
    author_type: MessageAuthorType;
    /**
     * Display name of the message author
     */
    author_name?: string;
    /**
     * ISO timestamp when the message was created
     */
    created_at: string;
    /**
     * Whether this is an internal note (not shown to customer)
     */
    is_private: boolean;
}
/**
 * Status of a support ticket
 */
export type TicketStatus = 'new' | 'open' | 'pending' | 'on_hold' | 'resolved';
/**
 * A support ticket in the conversations system
 */
export interface Ticket {
    /**
     * Unique identifier for the ticket
     */
    id: string;
    /**
     * Current status of the ticket
     */
    status: TicketStatus;
    /**
     * Preview of the last message
     */
    last_message?: string;
    /**
     * ISO timestamp of the last message
     */
    last_message_at?: string;
    /**
     * Total number of messages in this ticket
     */
    message_count: number;
    /**
     * ISO timestamp when the ticket was created
     */
    created_at: string;
    /**
     * Array of messages (only present in detailed ticket view)
     */
    messages?: Message[];
    /**
     * Number of unread messages from the team
     */
    unread_count?: number;
}
/**
 * Visual state of the conversations widget
 */
export type ConversationsWidgetState = 'open' | 'closed';
/**
 * Response from sending a message
 */
export interface SendMessageResponse {
    /**
     * ID of the ticket this message belongs to
     */
    ticket_id: string;
    /**
     * ID of the newly created message
     */
    message_id: string;
    /**
     * Current status of the ticket
     */
    ticket_status: TicketStatus;
    /**
     * ISO timestamp when the message was created
     */
    created_at: string;
    /**
     * Number of unread messages from the team
     * After customer sends a message, this is always 0
     */
    unread_count: number;
}
/**
 * Response from fetching messages
 */
export interface GetMessagesResponse {
    /**
     * ID of the ticket
     */
    ticket_id: string;
    /**
     * Current status of the ticket
     */
    ticket_status: TicketStatus;
    /**
     * Array of messages
     */
    messages: Message[];
    /**
     * Whether there are more messages to fetch
     */
    has_more: boolean;
    /**
     * Number of unread messages from the team
     */
    unread_count: number;
}
/**
 * Response from marking messages as read
 */
export interface MarkAsReadResponse {
    /**
     * Whether the operation was successful
     */
    success: boolean;
    /**
     * Number of unread messages (should be 0 after marking as read)
     */
    unread_count: number;
}
/**
 * Options for fetching tickets list
 */
export interface GetTicketsOptions {
    /**
     * Filter by ticket status (e.g., 'open', 'closed')
     */
    status?: string;
    /**
     * Number of tickets to return (default: 20)
     */
    limit?: number;
    /**
     * Pagination offset (default: 0)
     */
    offset?: number;
}
/**
 * Response from fetching tickets list
 */
export interface GetTicketsResponse {
    /**
     * Total count of tickets
     */
    count: number;
    /**
     * Array of tickets
     */
    results: Ticket[];
}
/**
 * Payload for restoring ticket access from a one-time token
 */
export interface RestoreFromTokenPayload {
    /**
     * Opaque one-time restore token from email link
     */
    restore_token: string;
    /**
     * Current browser widget session ID requesting restore
     */
    widget_session_id: string;
    /**
     * Optional distinct ID for debugging/observability
     */
    distinct_id?: string;
    /**
     * Optional current URL for backend observability
     */
    current_url?: string;
}
export type RestoreFromTokenStatus = 'success' | 'expired' | 'invalid' | 'used';
/**
 * Response from restore token exchange endpoint
 */
export interface RestoreFromTokenResponse {
    /**
     * Restore result
     */
    status: RestoreFromTokenStatus;
    /**
     * Canonical widget session ID to use after restore
     */
    widget_session_id?: string;
    /**
     * Migrated ticket IDs, if any
     */
    migrated_ticket_ids?: string[];
    /**
     * Optional machine-readable backend code
     */
    code?: string;
}
/**
 * Payload for requesting a self-service restore link email
 */
export interface RequestRestoreLinkPayload {
    email: string;
    request_url: string;
}
/**
 * Response from self-service restore link request
 */
export interface RequestRestoreLinkResponse {
    ok: true;
}
/**
 * User traits to send with messages
 */
export interface ConversationsTraits {
    name?: string | null;
    email?: string | null;
    [key: string]: string | number | boolean | null | undefined;
}
/**
 * User-provided identification data (collected via the widget form)
 */
export interface UserProvidedTraits {
    name?: string;
    email?: string;
}
/**
 * Session context captured when creating a new ticket
 */
export interface SessionContext {
    /**
     * URL to the session replay at the time the ticket was created
     * Includes timestamp to jump to the exact moment
     */
    session_replay_url?: string;
    /**
     * Page URL where the ticket was created
     */
    current_url?: string;
}
/**
 * Payload for sending a message via the conversations API
 */
export interface SendMessagePayload {
    /**
     * Widget session ID for access control
     */
    widget_session_id: string;
    /**
     * Distinct ID for linking to PostHog Person
     */
    distinct_id: string;
    /**
     * The message content to send
     */
    message: string;
    /**
     * User identification traits
     */
    traits: {
        name: string | null;
        email: string | null;
    };
    /**
     * Ticket ID to send the message to (null to create a new ticket)
     */
    ticket_id: string | null;
    /**
     * Session ID captured when creating a new ticket
     * Stored as a separate queryable DB field
     */
    session_id?: string;
    /**
     * Session context captured when creating a new ticket
     * Stored in a JSONField for flexibility
     */
    session_context?: SessionContext;
}
