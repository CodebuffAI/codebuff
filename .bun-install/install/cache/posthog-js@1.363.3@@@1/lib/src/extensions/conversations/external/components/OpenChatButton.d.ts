import type { WidgetPosition } from '../../../../posthog-conversations-types';
interface OpenChatButtonProps {
    primaryColor: string;
    position?: WidgetPosition;
    handleToggleOpen: () => void;
    unreadCount?: number;
}
export declare const OpenChatButton: ({ primaryColor, position, handleToggleOpen, unreadCount, }: OpenChatButtonProps) => import("preact").JSX.Element;
export {};
