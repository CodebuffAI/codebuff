import { FunctionComponent } from 'preact';
import { Ticket } from '../../../../posthog-conversations-types';
import { getStyles } from './styles';
interface TicketListItemProps {
    ticket: Ticket;
    styles: ReturnType<typeof getStyles>;
    onClick: (ticketId: string) => void;
}
/**
 * A single ticket item in the ticket list
 */
export declare const TicketListItem: FunctionComponent<TicketListItemProps>;
export {};
