import { h } from 'preact';
import { getStyles } from './styles';
interface RestoreRequestViewProps {
    styles: ReturnType<typeof getStyles>;
    restoreEmail: string;
    restoreEmailError: string | null;
    restoreRequestLoading: boolean;
    restoreRequestSuccess: boolean;
    onEmailChange: (e: Event) => void;
    onSubmit: (e: Event) => void;
}
export declare function RestoreRequestView({ styles, restoreEmail, restoreEmailError, restoreRequestLoading, restoreRequestSuccess, onEmailChange, onSubmit, }: RestoreRequestViewProps): h.JSX.Element;
export {};
