import type { APIBaseInteraction, APIDMInteractionWrapper, APIGuildInteractionWrapper, APIInteractionDataResolved, ComponentType, InteractionType } from '../index';
import type { APIBaseComponent } from '../message';
export interface APIBaseModalSubmitComponent<T extends ComponentType> extends APIBaseComponent<T> {
    custom_id: string;
}
export interface APIModalSubmitTextInputComponent extends APIBaseModalSubmitComponent<ComponentType.TextInput> {
    value: string;
}
export interface APIModalSubmitStringSelectComponent extends APIBaseModalSubmitComponent<ComponentType.StringSelect> {
    values: string[];
}
export interface APIModalSubmitUserSelectComponent extends APIBaseModalSubmitComponent<ComponentType.UserSelect> {
    values: string[];
}
export interface APIModalSubmitRoleSelectComponent extends APIBaseModalSubmitComponent<ComponentType.RoleSelect> {
    values: string[];
}
export interface APIModalSubmitMentionableSelectComponent extends APIBaseModalSubmitComponent<ComponentType.MentionableSelect> {
    values: string[];
}
export interface APIModalSubmitChannelSelectComponent extends APIBaseModalSubmitComponent<ComponentType.ChannelSelect> {
    values: string[];
}
export interface APIModalSubmitFileUploadComponent extends APIBaseModalSubmitComponent<ComponentType.FileUpload> {
    values: string[];
}
export type ModalSubmitComponent = APIModalSubmitChannelSelectComponent | APIModalSubmitFileUploadComponent | APIModalSubmitMentionableSelectComponent | APIModalSubmitRoleSelectComponent | APIModalSubmitStringSelectComponent | APIModalSubmitTextInputComponent | APIModalSubmitUserSelectComponent;
export interface ModalSubmitActionRowComponent extends APIBaseComponent<ComponentType.ActionRow> {
    components: APIModalSubmitTextInputComponent[];
}
export interface ModalSubmitTextDisplayComponent extends APIBaseComponent<ComponentType.TextDisplay> {
}
export interface ModalSubmitLabelComponent extends APIBaseComponent<ComponentType.Label> {
    component: ModalSubmitComponent;
}
export type APIModalSubmissionComponent = ModalSubmitActionRowComponent | ModalSubmitLabelComponent | ModalSubmitTextDisplayComponent;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-modal-submit-data-structure}
 */
export interface APIModalSubmission {
    /**
     * Data for users, members, channels, and roles in the modal's auto-populated select menus
     *
     * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-resolved-data-structure}
     */
    resolved?: APIInteractionDataResolved;
    /**
     * A developer-defined identifier for the component, max 100 characters
     */
    custom_id: string;
    /**
     * A list of child components
     */
    components: APIModalSubmissionComponent[];
}
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIModalSubmitInteraction = APIBaseInteraction<InteractionType.ModalSubmit, APIModalSubmission> & Required<Pick<APIBaseInteraction<InteractionType.ModalSubmit, APIModalSubmission>, 'data'>>;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIModalSubmitDMInteraction = APIDMInteractionWrapper<APIModalSubmitInteraction>;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIModalSubmitGuildInteraction = APIGuildInteractionWrapper<APIModalSubmitInteraction>;
//# sourceMappingURL=modalSubmit.d.ts.map