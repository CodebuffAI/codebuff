import type { Permissions, Snowflake } from '../../globals';
import type { APIActionRowComponent, APIAllowedMentions, APIAttachment, APIChannel, APIEmbed, APIExtendedInvite, APIFollowedChannel, APIMessage, APIMessageActionRowComponent, APIMessageReference, APIUser, ChannelType, InviteTargetType, MessageFlags, OverwriteType, VideoQualityMode } from '../../payloads/v8/index';
import type { _AddUndefinedToPossiblyUndefinedPropertiesOfInterface, _StrictPartial } from '../../utils/internals';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIChannelPatchOverwrite extends RESTPutAPIChannelPermissionJSONBody {
    id: Snowflake;
}
/**
 * https://discord.com/developers/docs/resources/channel#get-channel
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIChannelResult = APIChannel;
/**
 * https://discord.com/developers/docs/resources/channel#modify-channel
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPatchAPIChannelJSONBody {
    /**
     * 1-100 character channel name
     *
     * Channel types: all
     */
    name?: string | undefined;
    /**
     * The type of channel; only conversion between `text` and `news`
     * is supported and only in guilds with the "NEWS" feature
     *
     * Channel types: text, news
     */
    type?: ChannelType.GuildNews | ChannelType.GuildText | undefined;
    /**
     * The position of the channel in the left-hand listing
     *
     * Channel types: all
     */
    position?: number | null | undefined;
    /**
     * 0-1024 character channel topic
     *
     * Channel types: text, news
     */
    topic?: string | null | undefined;
    /**
     * Whether the channel is nsfw
     *
     * Channel types: text, news, store
     */
    nsfw?: boolean | null | undefined;
    /**
     * Amount of seconds a user has to wait before sending another message (0-21600);
     * bots, as well as users with the permission `MANAGE_MESSAGES` or `MANAGE_CHANNELS`,
     * are unaffected
     *
     * Channel types: text
     */
    rate_limit_per_user?: number | null | undefined;
    /**
     * The bitrate (in bits) of the voice channel; 8000 to 96000 (128000 for VIP servers)
     *
     * Channel types: voice
     */
    bitrate?: number | null | undefined;
    /**
     * The user limit of the voice channel; 0 refers to no limit, 1 to 99 refers to a user limit
     *
     * Channel types: voice
     */
    user_limit?: number | null | undefined;
    /**
     * Channel or category-specific permissions
     *
     * Channel types: all
     */
    permission_overwrites?: APIChannelPatchOverwrite[] | null | undefined;
    /**
     * ID of the new parent category for a channel
     *
     * Channel types: text, news, store, voice
     */
    parent_id?: Snowflake | null | undefined;
    /**
     * Voice region id for the voice or stage channel, automatic when set to `null`
     *
     * See https://discord.com/developers/docs/resources/voice#voice-region-object
     */
    rtc_region?: string | null | undefined;
    /**
     * The camera video quality mode of the voice channel
     *
     * See https://discord.com/developers/docs/resources/channel#channel-object-video-quality-modes
     */
    video_quality_mode?: VideoQualityMode | null | undefined;
}
/**
 * https://discord.com/developers/docs/resources/channel#modify-channel
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIChannelResult = APIChannel;
/**
 * https://discord.com/developers/docs/resources/channel#deleteclose-channel
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelResult = APIChannel;
/**
 * https://discord.com/developers/docs/resources/channel#get-channel-messages
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTGetAPIChannelMessagesQuery {
    /**
     * Get messages around this message ID
     */
    around?: Snowflake;
    /**
     * Get messages before this message ID
     */
    before?: Snowflake;
    /**
     * Get messages after this message ID
     */
    after?: Snowflake;
    /**
     * Max number of messages to return (1-100)
     *
     * @default 50
     */
    limit?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#get-channel-messages
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIChannelMessagesResult = APIMessage[];
/**
 * https://discord.com/developers/docs/resources/channel#get-channel-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIChannelMessageResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-reference-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageReferenceSend = _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Required<Pick<APIMessageReference, 'message_id'>>> & _StrictPartial<APIMessageReference> & {
    /**
     * Whether to error if the referenced message doesn't exist instead of sending as a normal (non-reply) message
     *
     * @default true
     */
    fail_if_not_exists?: boolean | undefined;
};
/**
 * https://discord.com/developers/docs/resources/channel#create-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIChannelMessageJSONBody {
    /**
     * The message contents (up to 2000 characters)
     */
    content?: string | undefined;
    /**
     * A nonce that can be used for optimistic message sending
     */
    nonce?: number | string | undefined;
    /**
     * `true` if this is a TTS message
     */
    tts?: boolean | undefined;
    /**
     * Embedded `rich` content (up to 6000 characters)
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object
     */
    embeds?: APIEmbed[] | undefined;
    /**
     * Embedded `rich` content
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object
     *
     * @deprecated Use `embeds` instead
     */
    embed?: APIEmbed | undefined;
    /**
     * Allowed mentions for a message
     *
     * See https://discord.com/developers/docs/resources/channel#allowed-mentions-object
     */
    allowed_mentions?: APIAllowedMentions | undefined;
    /**
     * Include to make your message a reply
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-reference-structure
     */
    message_reference?: APIMessageReferenceSend | undefined;
    /**
     * The components to include with the message
     *
     * See https://discord.com/developers/docs/interactions/message-components#component-object
     */
    components?: APIActionRowComponent<APIMessageActionRowComponent>[] | undefined;
    /**
     * IDs of up to 3 stickers in the server to send in the message
     *
     * See https://discord.com/developers/docs/resources/sticker#sticker-object
     */
    sticker_ids?: [Snowflake, Snowflake, Snowflake] | [Snowflake, Snowflake] | [Snowflake] | undefined;
    /**
     * Attachment objects with filename and description
     */
    attachments?: (Partial<Pick<APIAttachment, 'filename'>> & Pick<APIAttachment, 'description' | 'id'>)[] | undefined;
    /**
     * Message flags combined as a bitfield
     */
    flags?: MessageFlags | undefined;
}
/**
 * https://discord.com/developers/docs/resources/channel#create-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelMessageFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPostAPIChannelMessageJSONBody);
/**
 * https://discord.com/developers/docs/resources/channel#create-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelMessageResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/channel#crosspost-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelMessageCrosspostResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/channel#create-reaction
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIChannelMessageReactionResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#delete-own-reaction
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelMessageOwnReaction = never;
/**
 * https://discord.com/developers/docs/resources/channel#delete-user-reaction
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelMessageUserReactionResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#get-reactions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTGetAPIChannelMessageReactionUsersQuery {
    /**
     * Get users after this user ID
     */
    after?: Snowflake;
    /**
     * Max number of users to return (1-100)
     *
     * @default 25
     */
    limit?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#get-reactions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIChannelMessageReactionUsersResult = APIUser[];
/**
 * https://discord.com/developers/docs/resources/channel#delete-all-reactions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelAllMessageReactionsResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#delete-all-reactions-for-emoji
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelMessageReactionResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#edit-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPatchAPIChannelMessageJSONBody {
    /**
     * The new message contents (up to 2000 characters)
     */
    content?: string | null | undefined;
    /**
     * Embedded `rich` content (up to 6000 characters)
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object
     */
    embeds?: APIEmbed[] | null | undefined;
    /**
     * Embedded `rich` content
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object
     *
     * @deprecated Use `embeds` instead
     */
    embed?: APIEmbed | null | undefined;
    /**
     * Edit the flags of a message (only `SUPPRESS_EMBEDS` can currently be set/unset)
     *
     * When specifying flags, ensure to include all previously set flags/bits
     * in addition to ones that you are modifying
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-flags
     */
    flags?: MessageFlags | null | undefined;
    /**
     * Allowed mentions for the message
     *
     * See https://discord.com/developers/docs/resources/channel#allowed-mentions-object
     */
    allowed_mentions?: APIAllowedMentions | null | undefined;
    /**
     * Attached files to keep
     *
     * Starting with API v10, the `attachments` array must contain all attachments that should be present after edit, including **retained and new** attachments provided in the request body.
     *
     * See https://discord.com/developers/docs/resources/channel#attachment-object
     */
    attachments?: (Partial<Pick<APIAttachment, 'description' | 'filename'>> & Pick<APIAttachment, 'id'>)[] | undefined;
    /**
     * The components to include with the message
     *
     * See https://discord.com/developers/docs/interactions/message-components#component-object
     */
    components?: APIActionRowComponent<APIMessageActionRowComponent>[] | null | undefined;
}
/**
 * https://discord.com/developers/docs/resources/channel#edit-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIChannelMessageFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPatchAPIChannelMessageJSONBody);
/**
 * https://discord.com/developers/docs/resources/channel#edit-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIChannelMessageResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/channel#delete-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelMessageResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#bulk-delete-messages
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIChannelMessagesBulkDeleteJSONBody {
    /**
     * An array of message ids to delete (2-100)
     */
    messages: Snowflake[];
}
/**
 * https://discord.com/developers/docs/resources/channel#bulk-delete-messages
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelMessagesBulkDeleteResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#edit-channel-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPutAPIChannelPermissionJSONBody {
    /**
     * The bitwise value of all allowed permissions
     *
     * See https://en.wikipedia.org/wiki/Bit_field
     *
     * @default "0"
     */
    allow?: Permissions | null | undefined;
    /**
     * The bitwise value of all disallowed permissions
     *
     * See https://en.wikipedia.org/wiki/Bit_field
     *
     * @default "0"
     */
    deny?: Permissions | null | undefined;
    /**
     * `0` for a role or `1` for a member
     */
    type: OverwriteType;
}
/**
 * https://discord.com/developers/docs/resources/channel#edit-channel-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIChannelPermissionResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#get-channel-invites
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIChannelInvitesResult = APIExtendedInvite[];
/**
 * https://discord.com/developers/docs/resources/channel#create-channel-invite
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIChannelInviteJSONBody {
    /**
     * Duration of invite in seconds before expiry, or 0 for never
     *
     * @default 86400 (24 hours)
     */
    max_age?: number | undefined;
    /**
     * Max number of uses or 0 for unlimited
     *
     * @default 0
     */
    max_uses?: number | undefined;
    /**
     * Whether this invite only grants temporary membership
     *
     * @default false
     */
    temporary?: boolean | undefined;
    /**
     * If true, don't try to reuse a similar invite
     * (useful for creating many unique one time use invites)
     *
     * @default false
     */
    unique?: boolean | undefined;
    /**
     * The type of target for this voice channel invite
     *
     * See https://discord.com/developers/docs/resources/invite#invite-object-invite-target-types
     */
    target_type?: InviteTargetType | undefined;
    /**
     * The id of the user whose stream to display for this invite
     * - Required if `target_type` is 1
     * - The user must be streaming in the channel
     */
    target_user_id?: Snowflake | undefined;
    /**
     * The id of the embedded application to open for this invite
     * - Required if `target_type` is 2
     * - The application must have the `EMBEDDED` flag
     */
    target_application_id?: Snowflake | undefined;
}
/**
 * https://discord.com/developers/docs/resources/channel#create-channel-invite
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelInviteResult = APIExtendedInvite;
/**
 * https://discord.com/developers/docs/resources/channel#delete-channel-permission
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelPermissionResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#follow-news-channel
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIChannelFollowersJSONBody {
    /**
     * ID of target channel
     */
    webhook_channel_id: Snowflake;
}
/**
 * https://discord.com/developers/docs/resources/channel#follow-news-channel
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelFollowersResult = APIFollowedChannel;
/**
 * https://discord.com/developers/docs/resources/channel#trigger-typing-indicator
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelTypingResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#get-pinned-messages
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIChannelPinsResult = APIMessage[];
/**
 * https://discord.com/developers/docs/resources/channel#add-pinned-channel-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIChannelPinResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#delete-pinned-channel-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelPinResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#group-dm-add-recipient
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPutAPIChannelRecipientJSONBody {
    /**
     * Access token of a user that has granted your app the `gdm.join` scope
     */
    access_token: string;
    /**
     * Nickname of the user being added
     */
    nick?: string | undefined;
}
/**
 * https://discord.com/developers/docs/resources/channel#group-dm-add-recipient
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIChannelRecipientResult = unknown;
/**
 * https://discord.com/developers/docs/resources/channel#group-dm-remove-recipient
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIChannelRecipientResult = unknown;
//# sourceMappingURL=channel.d.ts.map