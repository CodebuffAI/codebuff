import type { APIChannel, APIEmbed, APIFollowedChannel, APIInvite, APIMessage, APIMessageReference, APIOverwrite, APIUser, ChannelType, InviteTargetUserType, MessageFlags, OverwriteType } from '../../payloads/v6/index';
/**
 * https://discord.com/developers/docs/resources/channel#overwrite-object-overwrite-structure
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIOverwriteSend {
    id: string;
    type: OverwriteType;
    allow: number | string;
    deny: number | string;
}
/**
 * https://discord.com/developers/docs/resources/channel#allowed-mentions-object-allowed-mention-types
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum AllowedMentionsTypes {
    Everyone = "everyone",
    Role = "roles",
    User = "users"
}
/**
 * https://discord.com/developers/docs/resources/channel#allowed-mentions-object-allowed-mentions-structure
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIAllowedMentionsSend {
    parse?: AllowedMentionsTypes[];
    roles?: string[];
    users?: string[];
}
/**
 * https://discord.com/developers/docs/resources/channel#modify-channel
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPIChannelJSONBody {
    name?: string | undefined;
    type?: ChannelType.GUILD_NEWS | ChannelType.GUILD_TEXT | undefined;
    position?: number | null | undefined;
    topic?: string | null | undefined;
    nsfw?: boolean | null | undefined;
    rate_limit_per_user?: number | null | undefined;
    user_limit?: number | null | undefined;
    permission_overwrites?: APIOverwrite[] | null | undefined;
    parent_id?: string | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIChannelResult = APIChannel;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIChannelResult = APIChannel;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIChannelResult = APIChannel;
/**
 * https://discord.com/developers/docs/resources/channel#get-channel-messages
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIChannelMessagesQuery {
    around?: string;
    before?: string;
    after?: string;
    limit?: number;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIChannelMessagesResult = APIMessage[];
/**
 * https://discord.com/developers/docs/resources/channel#create-message
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIChannelMessageJSONBody {
    content?: string | undefined;
    nonce?: number | string | undefined;
    tts?: boolean | undefined;
    embed?: APIEmbed | undefined;
    allowed_mentions?: APIAllowedMentionsSend | undefined;
    message_reference?: APIMessageReference | undefined;
}
/**
 * https://discord.com/developers/docs/resources/channel#create-message
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIChannelMessageFormDataBody = {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
    /**
     * The file contents
     */
    file: unknown;
} | {
    content?: string | undefined;
    nonce?: number | string | undefined;
    tts?: boolean | undefined;
    embed?: APIEmbed | undefined;
    allowed_mentions?: APIAllowedMentionsSend | undefined;
    message_reference?: APIMessageReference | undefined;
    /**
     * The file contents
     */
    file: unknown;
};
/**
 * https://discord.com/developers/docs/resources/channel#edit-message
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPIChannelMessageJSONBody {
    content?: string | null | undefined;
    embed?: APIEmbed | null | undefined;
    allowed_mentions?: APIAllowedMentionsSend | null | undefined;
    flags?: MessageFlags | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIChannelMessageResult = APIMessage;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIChannelMessageResult = APIMessage;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIChannelMessageResult = APIMessage;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIChannelMessageResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#get-reactions
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIChannelMessageReactionsQuery {
    before?: string;
    after?: string;
    limit?: number;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIChannelMessageReactionsResult = APIUser[];
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPutAPIChannelMessageReactionResult = never;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIChannelMessageReactionResult = never;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIChannelAllMessageReactionsResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#bulk-delete-messages
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIChannelMessagesBulkDeleteJSONBody {
    messages: string[];
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIChannelMessagesBulkDeleteResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#edit-channel-permissions
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPutAPIChannelPermissionsJSONBody {
    allow: number | string;
    deny: number | string;
    type: OverwriteType;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPutAPIChannelPermissionsResult = never;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIChannelPermissionsResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#get-channel-invites
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIChannelInvitesResult = APIInvite[];
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIChannelInviteJSONBody {
    max_age?: number | undefined;
    max_uses?: number | undefined;
    temporary?: boolean | undefined;
    unique?: boolean | undefined;
    target_user_id?: string | undefined;
    target_user_type?: InviteTargetUserType | undefined;
}
/**
 * https://discord.com/developers/docs/resources/channel#trigger-typing-indicator
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIChannelTypingResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#get-pinned-messages
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIChannelPinsResult = APIMessage[];
/**
 * https://discord.com/developers/docs/resources/channel#add-pinned-channel-message
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPutAPIChannelPinResult = never;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIChannelPinResult = never;
/**
 * https://discord.com/developers/docs/resources/channel#group-dm-add-recipient
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPutAPIChannelRecipientJSONBody {
    access_token: string;
    nick?: string | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPutAPIChannelRecipientResult = unknown;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIChannelRecipientResult = unknown;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIChannelMessageCrosspostResult = APIMessage;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIChannelFollowersJSONBody {
    webhook_channel_id: string;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIChannelFollowersResult = APIFollowedChannel;
//# sourceMappingURL=channel.d.ts.map