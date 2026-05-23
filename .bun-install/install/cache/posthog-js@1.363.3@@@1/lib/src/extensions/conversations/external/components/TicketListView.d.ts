import { FunctionComponent } from 'preact';
import { Ticket } from '../../../../posthog-conversations-types';
import { getStyles } from './styles';
interface TicketListViewProps {
    tickets: Ticket[];
    isLoading: boolean;
    styles: ReturnType<typeof getStyles>;
    onSelectTicket: (ticketId: string) => void;
    onNewConversation: () => void;
    onOpenRestoreRequest: () => void;
}
/**
 * Ticket list view showing all user's tickets
 */
export declare const TicketListView: FunctionComponent<TicketListViewProps>;
export {};
