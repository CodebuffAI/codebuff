import { h } from 'preact';
import { ConversationsRemoteConfig } from '../../../../posthog-conversations-types';
import { getStyles } from './styles';
interface IdentificationFormViewProps {
    config: ConversationsRemoteConfig;
    styles: ReturnType<typeof getStyles>;
    formName: string;
    formEmail: string;
    formEmailError: string | null;
    onNameChange: (e: Event) => void;
    onEmailChange: (e: Event) => void;
    onSubmit: (e: Event) => void;
}
export declare function IdentificationFormView({ config, styles, formName, formEmail, formEmailError, onNameChange, onEmailChange, onSubmit, }: IdentificationFormViewProps): h.JSX.Element;
export {};
