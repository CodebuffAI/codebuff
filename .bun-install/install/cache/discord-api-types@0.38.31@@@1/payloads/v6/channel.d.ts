/**
 * Types extracted from https://discord.com/developers/docs/resources/channel
 */
import type { APIPartialEmoji } from './emoji';
import type { APIGuildMember } from './guild';
import type { APIUser } from './user';
/**
 * Not documented, but partial only includes id, name, and type
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIPartialChannel {
    id: string;
    type: ChannelType;
    name?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#channel-object-channel-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIChannel extends APIPartialChannel {
    guild_id?: string;
    position?: number;
    permission_overwrites?: APIOverwrite[];
    name?: string;
    topic?: string | null;
    nsfw?: boolean;
    last_message_id?: string | null;
    bitrate?: number;
    user_limit?: number;
    rate_limit_per_user?: number;
    recipients?: APIUser[];
    icon?: string | null;
    owner_id?: string;
    application_id?: string;
    parent_id?: string | null;
    last_pin_timestamp?: string | null;
}
/**
 * https://discord.com/developers/docs/resources/channel#channel-object-channel-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum ChannelType {
    GUILD_TEXT = 0,
    DM = 1,
    GUILD_VOICE = 2,
    GROUP_DM = 3,
    GUILD_CATEGORY = 4,
    GUILD_NEWS = 5,
    GUILD_STORE = 6
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIMessage {
    id: string;
    channel_id: string;
    guild_id?: string;
    author: APIUser;
    member?: APIGuildMember;
    content: string;
    timestamp: string;
    edited_timestamp: string | null;
    tts: boolean;
    mention_everyone: boolean;
    mentions: (APIUser & {
        member?: Omit<APIGuildMember, 'user'>;
    })[];
    mention_roles: string[];
    mention_channels?: APIChannelMention[];
    attachments: APIAttachment[];
    embeds: APIEmbed[];
    reactions?: APIReaction[];
    nonce?: number | string;
    pinned: boolean;
    webhook_id?: string;
    type: MessageType;
    activity?: APIMessageActivity;
    application?: APIMessageApplication;
    message_reference?: APIMessageReference;
    flags?: MessageFlags;
    referenced_message?: APIMessage | null;
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum MessageType {
    DEFAULT = 0,
    RECIPIENT_ADD = 1,
    RECIPIENT_REMOVE = 2,
    CALL = 3,
    CHANNEL_NAME_CHANGE = 4,
    CHANNEL_ICON_CHANGE = 5,
    CHANNEL_PINNED_MESSAGE = 6,
    GUILD_MEMBER_JOIN = 7,
    USER_PREMIUM_GUILD_SUBSCRIPTION = 8,
    USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1 = 9,
    USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2 = 10,
    USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3 = 11,
    CHANNEL_FOLLOW_ADD = 12,
    GUILD_DISCOVERY_DISQUALIFIED = 14,
    GUILD_DISCOVERY_REQUALIFIED = 15,
    GUILD_DISCOVERY_GRACE_PERIOD_INITIAL_WARNING = 16,
    GUILD_DISCOVERY_GRACE_PERIOD_FINAL_WARNING = 17
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-activity-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIMessageActivity {
    type: MessageActivityType;
    party_id?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-application-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIMessageApplication {
    id: string;
    cover_image?: string;
    description: string;
    icon: string | null;
    name: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-reference-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIMessageReference {
    message_id?: string;
    channel_id: string;
    guild_id?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-activity-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum MessageActivityType {
    JOIN = 1,
    SPECTATE = 2,
    LISTEN = 3,
    JOIN_REQUEST = 5
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-flags
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum MessageFlags {
    CROSSPOSTED = 1,
    IS_CROSSPOST = 2,
    SUPPRESS_EMBEDS = 4,
    SOURCE_MESSAGE_DELETED = 8,
    URGENT = 16
}
/**
 * https://discord.com/developers/docs/resources/channel#reaction-object-reaction-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIReaction {
    count: number;
    me: boolean;
    emoji: APIPartialEmoji;
}
/**
 * https://discord.com/developers/docs/resources/channel#overwrite-object-overwrite-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIOverwrite {
    id: string;
    type: OverwriteType;
    /**
     * @deprecated Use `allow_new` instead
     */
    allow: number;
    allow_new: string;
    /**
     * @deprecated Use `deny_new` instead
     */
    deny: number;
    deny_new: string;
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum OverwriteType {
    Member = "member",
    Role = "role"
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbed {
    title?: string;
    type?: EmbedType;
    description?: string;
    url?: string;
    timestamp?: string;
    color?: number;
    footer?: APIEmbedFooter;
    image?: APIEmbedImage;
    thumbnail?: APIEmbedThumbnail;
    video?: APIEmbedVideo;
    provider?: APIEmbedProvider;
    author?: APIEmbedAuthor;
    fields?: APIEmbedField[];
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum EmbedType {
    Rich = "rich",
    Image = "image",
    Video = "video",
    GifV = "gifv",
    Article = "article",
    Link = "link"
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-thumbnail-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbedThumbnail {
    url?: string;
    proxy_url?: string;
    height?: number;
    width?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-video-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbedVideo {
    url?: string;
    height?: number;
    width?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-image-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbedImage {
    url?: string;
    proxy_url?: string;
    height?: number;
    width?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-provider-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbedProvider {
    name?: string;
    url?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-author-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbedAuthor {
    name?: string;
    url?: string;
    icon_url?: string;
    proxy_icon_url?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-footer-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbedFooter {
    text: string;
    icon_url?: string;
    proxy_icon_url?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-field-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmbedField {
    name: string;
    value: string;
    inline?: boolean;
}
/**
 * https://discord.com/developers/docs/resources/channel#attachment-object-attachment-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIAttachment {
    id: string;
    filename: string;
    size: number;
    url: string;
    proxy_url: string;
    height: number | null;
    width: number | null;
}
/**
 * https://discord.com/developers/docs/resources/channel#channel-mention-object-channel-mention-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIChannelMention {
    id: string;
    guild_id: string;
    type: ChannelType;
    name: string;
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIFollowedChannel {
    channel_id: string;
    webhook_id: string;
}
//# sourceMappingURL=channel.d.ts.map