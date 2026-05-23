import type { Permissions, Snowflake } from '../../../globals';
import type { APIRole, ApplicationIntegrationType, InteractionContextType, Locale } from '../../../v9';
import type { APIChannel, APIPartialChannel, APIThreadChannel, ChannelType, ThreadChannelType } from '../channel';
import type { APIBaseGuildMember, APIFlaggedGuildMember, APIGuildMember, APIGuildMemberAvatar, APIGuildMemberJoined, APIPartialInteractionGuild } from '../guild';
import type { APIAttachment, APIMessage } from '../message';
import type { APIEntitlement } from '../monetization';
import type { APIUser } from '../user';
import type { InteractionType } from './responses';
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#message-interaction-metadata-object}
 */
export type APIMessageInteractionMetadata = APIApplicationCommandInteractionMetadata | APIMessageComponentInteractionMetadata | APIModalSubmitInteractionMetadata;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#message-interaction-metadata-object}
 */
export interface APIBaseInteractionMetadata<Type extends InteractionType> {
    /**
     * ID of the interaction
     */
    id: Snowflake;
    /**
     * Type of interaction
     */
    type: Type;
    /**
     * User who triggered the interaction
     */
    user: APIUser;
    /**
     * IDs for installation context(s) related to an interaction
     */
    authorizing_integration_owners: APIAuthorizingIntegrationOwnersMap;
    /**
     * ID of the original response message, present only on follow-up messages
     */
    original_response_message_id?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/message#message-interaction-metadata-object-application-command-interaction-metadata-structure}
 */
export interface APIApplicationCommandInteractionMetadata extends APIBaseInteractionMetadata<InteractionType.ApplicationCommand> {
    /**
     * The user the command was run on, present only on user commands interactions
     */
    target_user?: APIUser;
    /**
     * The ID of the message the command was run on, present only on message command interactions.
     * The original response message will also have `message_reference` and `referenced_message` pointing to this message.
     */
    target_message_id?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/message#message-interaction-metadata-object-message-command-interaction-metadata-structure}
 */
export interface APIMessageComponentInteractionMetadata extends APIBaseInteractionMetadata<InteractionType.MessageComponent> {
    /**
     * ID of the message that contained the interactive component
     */
    interacted_message_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/message#message-interaction-metadata-object-modal-submit-interaction-metadata-structure}
 */
export interface APIModalSubmitInteractionMetadata extends APIBaseInteractionMetadata<InteractionType.ModalSubmit> {
    /**
     * Metadata for the interaction that was used to open the modal
     */
    triggering_interaction_metadata: APIApplicationCommandInteractionMetadata | APIMessageComponentInteractionMetadata;
}
export type PartialAPIMessageInteractionGuildMember = Pick<APIGuildMember, 'avatar' | 'communication_disabled_until' | 'deaf' | 'joined_at' | 'mute' | 'nick' | 'pending' | 'premium_since' | 'roles'>;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#message-interaction-object}
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
     * The name of the application command, including subcommands and subcommand groups
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
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIInteractionGuildMember extends APIGuildMember {
    permissions: Permissions;
    user: APIUser;
}
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
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
     * Guild that the interaction was sent from
     */
    guild?: APIPartialInteractionGuild;
    /**
     * Guild that the interaction was sent from
     */
    guild_id?: Snowflake;
    /**
     * The channel it was sent from
     */
    channel?: Partial<APIChannel> & Pick<APIChannel, 'id' | 'type'>;
    /**
     * The id of the channel it was sent from
     *
     * @deprecated Use {@link APIBaseInteraction.channel} instead
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
     * Bitwise set of permissions the app or bot has within the channel the interaction was sent from
     */
    app_permissions: Permissions;
    /**
     * The selected language of the invoking user
     */
    locale: Locale;
    /**
     * The guild's preferred locale, if invoked in a guild
     */
    guild_locale?: Locale;
    /**
     * For monetized apps, any entitlements for the invoking user, representing access to premium SKUs
     */
    entitlements: APIEntitlement[];
    /**
     * Mapping of installation contexts that the interaction was authorized for to related user or guild IDs.
     */
    authorizing_integration_owners: APIAuthorizingIntegrationOwnersMap;
    /**
     * Context where the interaction was triggered from
     */
    context?: InteractionContextType;
    /**
     * Attachment size limit in bytes
     */
    attachment_size_limit: number;
}
export type APIAuthorizingIntegrationOwnersMap = {
    [key in ApplicationIntegrationType]?: Snowflake;
};
export type APIDMInteractionWrapper<Original extends APIBaseInteraction<InteractionType, unknown>> = Omit<Original, 'guild_id' | 'member'> & Required<Pick<Original, 'user'>>;
export type APIGuildInteractionWrapper<Original extends APIBaseInteraction<InteractionType, unknown>> = Omit<Original, 'user'> & Required<Pick<Original, 'guild_id' | 'member'>>;
export interface APIInteractionDataResolvedChannelBase<T extends ChannelType> extends Required<APIPartialChannel> {
    type: T;
    permissions: Permissions;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#channel-object}
 */
export type APIInteractionDataResolvedChannel = APIInteractionDataResolvedChannelBase<Exclude<ChannelType, ThreadChannelType>> | (APIInteractionDataResolvedChannelBase<ThreadChannelType> & Pick<APIThreadChannel, 'parent_id' | 'thread_metadata'>);
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIInteractionDataResolvedGuildMember extends APIBaseGuildMember, APIFlaggedGuildMember, APIGuildMemberAvatar, APIGuildMemberJoined {
    permissions: Permissions;
}
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-resolved-data-structure}
 */
export interface APIInteractionDataResolved {
    users?: Record<Snowflake, APIUser>;
    roles?: Record<Snowflake, APIRole>;
    members?: Record<Snowflake, APIInteractionDataResolvedGuildMember>;
    channels?: Record<Snowflake, APIInteractionDataResolvedChannel>;
    attachments?: Record<Snowflake, APIAttachment>;
}
/**
 * @deprecated Renamed to `APIInteractionDataResolved`
 */
export type APIChatInputApplicationCommandInteractionDataResolved = APIInteractionDataResolved;
/**
 * `users` and optional `members` from APIInteractionDataResolved, for user commands and user selects
 */
export type APIUserInteractionDataResolved = Pick<APIInteractionDataResolved, 'members'> & Required<Pick<APIInteractionDataResolved, 'users'>>;
/**
 * @deprecated Renamed to `APIUserInteractionDataResolved`
 */
export type APIUserApplicationCommandInteractionDataResolved = APIUserInteractionDataResolved;
//# sourceMappingURL=base.d.ts.map