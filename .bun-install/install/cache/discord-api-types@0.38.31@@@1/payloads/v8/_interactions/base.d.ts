import type { Permissions, Snowflake } from '../../../globals';
import type { LocaleString } from '../../../v8';
import type { APIMessage } from '../channel';
import type { APIGuildMember } from '../guild';
import type { APIUser } from '../user';
import type { InteractionType } from './responses';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type PartialAPIMessageInteractionGuildMember = Pick<APIGuildMember, 'avatar' | 'communication_disabled_until' | 'deaf' | 'joined_at' | 'mute' | 'nick' | 'pending' | 'premium_since' | 'roles'>;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#message-interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIMessageInteraction {
    /**
     * ID of the interaction
     */
    id: Snowflake;
    /**
     * The type of interaction
     */
    type: InteractionType;
    /**
     * The name of the ApplicationCommand
     */
    name: string;
    /**
     * The user who invoked the interaction
     */
    user: APIUser;
    /**
     * The guild member who invoked the interaction, only sent in MESSAGE_CREATE events
     */
    member?: PartialAPIMessageInteractionGuildMember;
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-member-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIInteractionGuildMember extends APIGuildMember {
    permissions: Permissions;
    user: APIUser;
}
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIBaseInteraction<Type extends InteractionType, Data> {
    /**
     * ID of the interaction
     */
    id: Snowflake;
    /**
     * ID of the application this interaction is for
     */
    application_id: Snowflake;
    /**
     * The type of interaction
     */
    type: Type;
    /**
     * The command data payload
     */
    data?: Data;
    /**
     * The guild it was sent from
     */
    guild_id?: Snowflake;
    /**
     * The channel it was sent from
     */
    channel_id?: Snowflake;
    /**
     * Guild member data for the invoking user, including permissions
     *
     * **This is only sent when an interaction is invoked in a guild**
     */
    member?: APIInteractionGuildMember;
    /**
     * User object for the invoking user, if invoked in a DM
     */
    user?: APIUser;
    /**
     * A continuation token for responding to the interaction
     */
    token: string;
    /**
     * Read-only property, always `1`
     */
    version: 1;
    /**
     * For components, the message they were attached to
     */
    message?: APIMessage;
    /**
     * The selected language of the invoking user
     */
    locale: LocaleString;
    /**
     * The guild's preferred locale, if invoked in a guild
     */
    guild_locale?: LocaleString;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIDMInteractionWrapper<Original extends APIBaseInteraction<InteractionType, unknown>> = Omit<Original, 'guild_id' | 'member'> & Required<Pick<Original, 'user'>>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIGuildInteractionWrapper<Original extends APIBaseInteraction<InteractionType, unknown>> = Omit<Original, 'user'> & Required<Pick<Original, 'guild_id' | 'member'>>;
//# sourceMappingURL=base.d.ts.map