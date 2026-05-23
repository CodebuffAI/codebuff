import { h, Component } from 'preact';
import { ConversationsRemoteConfig, Message, ConversationsWidgetState, RequestRestoreLinkResponse, UserProvidedTraits, Ticket } from '../../../../posthog-conversations-types';
/**
 * Type for the current view in the widget
 */
export type WidgetView = 'tickets' | 'messages' | 'restore_request' | 'identification';
interface WidgetProps {
    config: ConversationsRemoteConfig;
    initialState?: ConversationsWidgetState;
    initialUserTraits?: UserProvidedTraits | null;
    isUserIdentified?: boolean;
    initialView?: WidgetView;
    initialTickets?: Ticket[];
    hasMultipleTickets?: boolean;
    onSendMessage: (message: string) => Promise<void>;
    onStateChange?: (state: ConversationsWidgetState) => void;
    onIdentify?: (traits: UserProvidedTraits) => void;
    onRequestRestoreLink?: (email: string) => Promise<RequestRestoreLinkResponse>;
    onSelectTicket?: (ticketId: string) => void;
    onNewConversation?: () => void;
    onBackToTickets?: () => void;
    onViewChange?: (view: WidgetView) => void;
}
interface WidgetState {
    state: ConversationsWidgetState;
    view: WidgetView;
    messages: Message[];
    tickets: Ticket[];
    ticketsLoading: boolean;
    inputValue: string;
    isLoading: boolean;
    error: string | null;
    formName: string;
    formEmail: string;
    formEmailError: string | null;
    userTraits: UserProvidedTraits | null;
    unreadCount: number;
    hasMultipleTickets: boolean;
    restoreEmail: string;
    restoreEmailError: string | null;
    restoreRequestLoading: boolean;
    restoreRequestSuccess: boolean;
}
export declare class ConversationsWidget extends Component<WidgetProps, WidgetState> {
    private _messagesEndRef;
    private _inputRef;
    constructor(props: WidgetProps);
    /**
     * Check if we need to show the identification form
     */
    private _needsIdentification;
    componentDidMount(): void;
    componentDidUpdate(_prevProps: WidgetProps, prevState: WidgetState): void;
    private _addGreetingMessage;
    private _scrollToBottom;
    private _focusInput;
    private _handleToggleOpen;
    private _handleClose;
    private _handleSelectTicket;
    private _handleNewConversation;
    private _handleBackToTickets;
    private _handleOpenRestoreRequest;
    private _handleCloseRestoreRequest;
    private _handleInputChange;
    private _handleKeyPress;
    private _handleFormNameChange;
    private _handleFormEmailChange;
    private _handleRestoreEmailChange;
    private _validateEmail;
    private _handleFormSubmit;
    private _handleRestoreRequestSubmit;
    private _handleSendMessage;
    /**
     * Public method to add messages from outside
     */
    addMessages(messages: Message[]): void;
    /**
     * Public method to show the widget
     */
    show(): void;
    /**
     * Public method to hide the widget
     */
    hide(): void;
    /**
     * Get user traits (either provided via form or from props)
     */
    getUserTraits(): UserProvidedTraits | null;
    /**
     * Called when user identifies via posthog.identify()
     * Navigates away from identification form since we now know who they are
     */
    setUserIdentified(): void;
    /**
     * Set the unread message count (called by manager)
     */
    setUnreadCount(count: number): void;
    /**
     * Update the tickets list (called by manager during polling)
     */
    updateTickets(tickets: Ticket[]): void;
    /**
     * Set the current view (tickets list or messages)
     */
    setView(view: WidgetView): void;
    /**
     * Get the current view
     */
    getView(): WidgetView;
    /**
     * Set tickets loading state
     */
    setTicketsLoading(loading: boolean): void;
    /**
     * Clear messages (used when switching tickets or starting new conversation)
     * @param addGreeting - If true, adds the greeting message after clearing
     */
    clearMessages(addGreeting?: boolean): void;
    private _renderIdentificationForm;
    private _renderBackButton;
    private _renderTicketList;
    private _renderMessages;
    private _renderRestoreRequestView;
    /**
     * Get the title for the current view
     */
    private _getTitle;
    /**
     * Render the content for the current view
     */
    private _renderViewContent;
    render(): h.JSX.Element;
}
export {};
