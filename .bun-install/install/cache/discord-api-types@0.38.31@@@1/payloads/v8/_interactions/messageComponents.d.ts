import type { ComponentType } from '../channel';
import type { APIBaseInteraction, InteractionType } from '../interactions';
import type { APIDMInteractionWrapper, APIGuildInteractionWrapper } from './base';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageComponentInteraction = APIBaseInteraction<InteractionType.MessageComponent, APIMessageComponentInteractionData> & Required<Pick<APIBaseInteraction<InteractionType.MessageComponent, APIMessageComponentInteractionData>, 'channel_id' | 'data' | 'message'>>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageComponentInteractionData = APIMessageButtonInteractionData | APIMessageSelectMenuInteractionData;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIMessageComponentBaseInteractionData<CType extends ComponentType> {
    /**
     * The `custom_id` of the component
     */
    custom_id: string;
    /**
     * The type of the component
     */
    component_type: CType;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageButtonInteractionData = APIMessageComponentBaseInteractionData<ComponentType.Button>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIMessageSelectMenuInteractionData extends APIMessageComponentBaseInteractionData<ComponentType.SelectMenu> {
    values: string[];
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageComponentDMInteraction = APIDMInteractionWrapper<APIMessageComponentInteraction>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageComponentGuildInteraction = APIGuildInteractionWrapper<APIMessageComponentInteraction>;
//# sourceMappingURL=messageComponents.d.ts.map