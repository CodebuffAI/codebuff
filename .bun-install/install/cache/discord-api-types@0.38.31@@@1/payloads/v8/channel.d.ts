/**
 * Types extracted from https://discord.com/developers/docs/resources/channel
 */
import type { Permissions, Snowflake } from '../../globals';
import type { APIApplication } from './application';
import type { APIPartialEmoji } from './emoji';
import type { APIGuildMember } from './guild';
import type { APIMessageInteraction } from './interactions';
import type { APIRole } from './permissions';
import type { APISticker, APIStickerItem } from './sticker';
import type { APIUser } from './user';
/**
 * Not documented, but partial only includes id, name, and type
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIPartialChannel {
    /**
     * The id of the channel
     */
    id: Snowflake;
    /**
     * The type of the channel
     *
     * See https://discord.com/developers/docs/resources/channel#channel-object-channel-types
     */
    type: ChannelType;
    /**
     * The name of the channel (2-100 characters)
     */
    name?: string;
}
/**
 * This interface is used to allow easy extension for other channel types. While
 * also allowing `APIPartialChannel` to be used without breaking.
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIChannelBase<T extends ChannelType> extends APIPartialChannel {
    type: T;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type TextChannelType = ChannelType.DM | ChannelType.GroupDM | ChannelType.GuildNews | ChannelType.GuildText;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type GuildChannelType = Exclude<ChannelType.GuildNews | ChannelType.GuildStageVoice | ChannelType.GuildStore | ChannelType.GuildVoice | TextChannelType, ChannelType.DM | ChannelType.GroupDM>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APITextBasedChannel<T extends ChannelType> extends APIChannelBase<T> {
    /**
     * The id of the last message sent in this channel (may not point to an existing or valid message)
     */
    last_message_id?: Snowflake | null;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuildChannel<T extends ChannelType> extends APIChannelBase<T> {
    /**
     * The id of the guild (may be missing for some channel objects received over gateway guild dispatches)
     */
    guild_id?: Snowflake;
    /**
     * Explicit permission overwrites for members and roles
     *
     * See https://discord.com/developers/docs/resources/channel#overwrite-object
     */
    permission_overwrites?: APIOverwrite[];
    /**
     * Sorting position of the channel
     */
    position: number;
    /**
     * ID of the parent category for a channel (each parent category can contain up to 50 channels)
     */
    parent_id?: Snowflake | null;
    /**
     * Whether the channel is nsfw
     */
    nsfw?: boolean;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type GuildTextChannelType = Exclude<TextChannelType, ChannelType.DM | ChannelType.GroupDM>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuildTextChannel<T extends GuildTextChannelType> extends APITextBasedChannel<T>, APIGuildChannel<T> {
    /**
     * The channel topic (0-1024 characters)
     */
    topic?: string | null;
    /**
     * When the last pinned message was pinned.
     * This may be `null` in events such as `GUILD_CREATE` when a message is not pinned
     */
    last_pin_timestamp?: string | null;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APITextChannel extends APIGuildTextChannel<ChannelType.GuildText> {
    /**
     * Amount of seconds a user has to wait before sending another message (0-21600);
     * bots, as well as users with the permission `MANAGE_MESSAGES` or `MANAGE_CHANNELS`, are unaffected
     */
    rate_limit_per_user?: number;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APINewsChannel = APIGuildTextChannel<ChannelType.GuildNews>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIGuildCategoryChannel = APIGuildChannel<ChannelType.GuildCategory>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIGuildStoreChannel = APIGuildChannel<ChannelType.GuildStore>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIVoiceChannel extends APIGuildChannel<ChannelType.GuildStageVoice | ChannelType.GuildVoice> {
    /**
     * The bitrate (in bits) of the voice channel
     */
    bitrate?: number;
    /**
     * The user limit of the voice channel
     */
    user_limit?: number;
    /**
     * Voice region id for the voice or stage channel, automatic when set to `null`
     *
     * See https://discord.com/developers/docs/resources/voice#voice-region-object
     */
    rtc_region?: string | null;
    /**
     * The camera video quality mode of the voice channel, `1` when not present
     *
     * See https://discord.com/developers/docs/resources/channel#channel-object-video-quality-modes
     */
    video_quality_mode?: VideoQualityMode;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
interface APIDMChannelBase<T extends ChannelType> extends APITextBasedChannel<T> {
    /**
     * The recipients of the DM
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    recipients?: APIUser[];
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIDMChannel = APIDMChannelBase<ChannelType.DM>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGroupDMChannel extends APIDMChannelBase<ChannelType.GroupDM> {
    /**
     * Application id of the group DM creator if it is bot-created
     */
    application_id?: Snowflake;
    /**
     * Icon hash
     */
    icon?: string | null;
    /**
     * ID of the DM creator
     */
    owner_id?: Snowflake;
    /**
     * The id of the last message sent in this channel (may not point to an existing or valid message)
     */
    last_message_id?: Snowflake | null;
}
/**
 * https://discord.com/developers/docs/resources/channel#channel-object-channel-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIChannel = APIDMChannel | APIGroupDMChannel | APIGuildCategoryChannel | APIGuildStoreChannel | APINewsChannel | APINewsChannel | APITextChannel | APIVoiceChannel;
/**
 * https://discord.com/developers/docs/resources/channel#channel-object-channel-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum ChannelType {
    /**
     * A text channel within a guild
     */
    GuildText = 0,
    /**
     * A direct message between users
     */
    DM = 1,
    /**
     * A voice channel within a guild
     */
    GuildVoice = 2,
    /**
     * A direct message between multiple users
     */
    GroupDM = 3,
    /**
     * An organizational category that contains up to 50 channels
     *
     * See https://support.discord.com/hc/en-us/articles/115001580171-Channel-Categories-101
     */
    GuildCategory = 4,
    /**
     * A channel that users can follow and crosspost into their own guild
     *
     * See https://support.discord.com/hc/en-us/articles/360032008192
     */
    GuildNews = 5,
    /**
     * A channel in which game developers can sell their game on Discord
     *
     * See https://discord.com/developers/docs/game-and-server-management/special-channels
     */
    GuildStore = 6,
    /**
     * A voice channel for hosting events with an audience
     *
     * See https://support.discord.com/hc/en-us/articles/1500005513722
     */
    GuildStageVoice = 13
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum VideoQualityMode {
    /**
     * Discord chooses the quality for optimal performance
     */
    Auto = 1,
    /**
     * 720p
     */
    Full = 2
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIMessage {
    /**
     * ID of the message
     */
    id: Snowflake;
    /**
     * ID of the channel the message was sent in
     */
    channel_id: Snowflake;
    /**
     * ID of the guild the message was sent in
     */
    guild_id?: Snowflake;
    /**
     * The author of this message (only a valid user in the case where the message is generated by a user or bot user)
     *
     * If the message is generated by a webhook, the author object corresponds to the webhook's id,
     * username, and avatar. You can tell if a message is generated by a webhook by checking for the `webhook_id` property
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    author: APIUser;
    /**
     * Member properties for this message's author
     *
     * The member object exists in `MESSAGE_CREATE` and `MESSAGE_UPDATE` events
     * from text-based guild channels
     *
     * See https://discord.com/developers/docs/resources/guild#guild-member-object
     */
    member?: APIGuildMember;
    /**
     * Contents of the message
     */
    content: string;
    /**
     * When this message was sent
     */
    timestamp: string;
    /**
     * When this message was edited (or null if never)
     */
    edited_timestamp: string | null;
    /**
     * Whether this was a TTS message
     */
    tts: boolean;
    /**
     * Whether this message mentions everyone
     */
    mention_everyone: boolean;
    /**
     * Users specifically mentioned in the message
     *
     * The `member` field is only present in `MESSAGE_CREATE` and `MESSAGE_UPDATE` events
     * from text-based guild channels
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     * See https://discord.com/developers/docs/resources/guild#guild-member-object
     */
    mentions: (APIUser & {
        member?: Omit<APIGuildMember, 'user'>;
    })[];
    /**
     * Roles specifically mentioned in this message
     *
     * See https://discord.com/developers/docs/topics/permissions#role-object
     */
    mention_roles: APIRole['id'][];
    /**
     * Channels specifically mentioned in this message
     *
     * Not all channel mentions in a message will appear in `mention_channels`.
     * - Only textual channels that are visible to everyone in a lurkable guild will ever be included
     * - Only crossposted messages (via Channel Following) currently include `mention_channels` at all
     *
     * If no mentions in the message meet these requirements, this field will not be sent
     *
     * See https://discord.com/developers/docs/resources/channel#channel-mention-object
     */
    mention_channels?: APIChannelMention[];
    /**
     * Any attached files
     *
     * See https://discord.com/developers/docs/resources/channel#attachment-object
     */
    attachments: APIAttachment[];
    /**
     * Any embedded content
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object
     */
    embeds: APIEmbed[];
    /**
     * Reactions to the message
     *
     * See https://discord.com/developers/docs/resources/channel#reaction-object
     */
    reactions?: APIReaction[];
    /**
     * A nonce that can be used for optimistic message sending (up to 25 characters)
     *
     * **You will not receive this from further fetches. This is received only once from a `MESSAGE_CREATE`
     * event to ensure it got sent**
     */
    nonce?: number | string;
    /**
     * Whether this message is pinned
     */
    pinned: boolean;
    /**
     * If the message is generated by a webhook, this is the webhook's id
     */
    webhook_id?: Snowflake;
    /**
     * Type of message
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-types
     */
    type: MessageType;
    /**
     * Sent with Rich Presence-related chat embeds
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-activity-structure
     */
    activity?: APIMessageActivity;
    /**
     * Sent with Rich Presence-related chat embeds
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-application-structure
     */
    application?: Partial<APIApplication>;
    /**
     * If the message is a response to an Interaction, this is the id of the interaction's application
     */
    application_id?: Snowflake;
    /**
     * Reference data sent with crossposted messages, replies, pins, and thread starter messages
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-reference-structure
     */
    message_reference?: APIMessageReference;
    /**
     * Message flags combined as a bitfield
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-flags
     *
     * See https://en.wikipedia.org/wiki/Bit_field
     */
    flags?: MessageFlags;
    /**
     * The message associated with the `message_reference`
     *
     * This field is only returned for messages with a `type` of `19` (REPLY).
     *
     * If the message is a reply but the `referenced_message` field is not present,
     * the backend did not attempt to fetch the message that was being replied to,
     * so its state is unknown.
     *
     * If the field exists but is `null`, the referenced message was deleted
     *
     * See https://discord.com/developers/docs/resources/channel#message-object
     */
    referenced_message?: APIMessage | null;
    /**
     * Sent if the message is a response to an Interaction
     */
    interaction?: APIMessageInteraction;
    /**
     * Sent if the message contains components like buttons, action rows, or other interactive components
     */
    components?: APIActionRowComponent<APIMessageActionRowComponent>[];
    /**
     * Sent if the message contains stickers
     *
     * See https://discord.com/developers/docs/resources/sticker#sticker-item-object
     */
    sticker_items?: APIStickerItem[];
    /**
     * The stickers sent with the message
     *
     * See https://discord.com/developers/docs/resources/sticker#sticker-object
     *
     * @deprecated Use `sticker_items` instead
     */
    stickers?: APISticker[];
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum MessageType {
    Default = 0,
    RecipientAdd = 1,
    RecipientRemove = 2,
    Call = 3,
    ChannelNameChange = 4,
    ChannelIconChange = 5,
    ChannelPinnedMessage = 6,
    GuildMemberJoin = 7,
    UserPremiumGuildSubscription = 8,
    UserPremiumGuildSubscriptionTier1 = 9,
    UserPremiumGuildSubscriptionTier2 = 10,
    UserPremiumGuildSubscriptionTier3 = 11,
    ChannelFollowAdd = 12,
    GuildDiscoveryDisqualified = 14,
    GuildDiscoveryRequalified = 15,
    GuildDiscoveryGracePeriodInitialWarning = 16,
    GuildDiscoveryGracePeriodFinalWarning = 17,
    Reply = 19,
    ChatInputCommand = 20,
    GuildInviteReminder = 22,
    ContextMenuCommand = 23
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-activity-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIMessageActivity {
    /**
     * Type of message activity
     *
     * See https://discord.com/developers/docs/resources/channel#message-object-message-activity-types
     */
    type: MessageActivityType;
    /**
     * `party_id` from a Rich Presence event
     *
     * See https://discord.com/developers/docs/rich-presence/how-to#updating-presence-update-presence-payload-fields
     */
    party_id?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-reference-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIMessageReference {
    /**
     * ID of the originating message
     */
    message_id?: Snowflake;
    /**
     * ID of the originating message's channel
     */
    channel_id: Snowflake;
    /**
     * ID of the originating message's guild
     */
    guild_id?: Snowflake;
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-activity-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum MessageActivityType {
    Join = 1,
    Spectate = 2,
    Listen = 3,
    JoinRequest = 5
}
/**
 * https://discord.com/developers/docs/resources/channel#message-object-message-flags
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum MessageFlags {
    /**
     * This message has been published to subscribed channels (via Channel Following)
     */
    Crossposted = 1,
    /**
     * This message originated from a message in another channel (via Channel Following)
     */
    IsCrosspost = 2,
    /**
     * Do not include any embeds when serializing this message
     */
    SuppressEmbeds = 4,
    /**
     * The source message for this crosspost has been deleted (via Channel Following)
     */
    SourceMessageDeleted = 8,
    /**
     * This message came from the urgent message system
     */
    Urgent = 16,
    /**
     * This message is only visible to the user who invoked the Interaction
     */
    Ephemeral = 64,
    /**
     * This message is an Interaction Response and the bot is "thinking"
     */
    Loading = 128
}
/**
 * https://discord.com/developers/docs/resources/channel#followed-channel-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIFollowedChannel {
    /**
     * Source channel id
     */
    channel_id: Snowflake;
    /**
     * Created target webhook id
     */
    webhook_id: Snowflake;
}
/**
 * https://discord.com/developers/docs/resources/channel#reaction-object-reaction-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIReaction {
    /**
     * Times this emoji has been used to react
     */
    count: number;
    /**
     * Whether the current user reacted using this emoji
     */
    me: boolean;
    /**
     * Emoji information
     *
     * See https://discord.com/developers/docs/resources/emoji#emoji-object
     */
    emoji: APIPartialEmoji;
}
/**
 * https://discord.com/developers/docs/resources/channel#overwrite-object-overwrite-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIOverwrite {
    /**
     * Role or user id
     */
    id: Snowflake;
    /**
     * Either 0 (role) or 1 (member)
     *
     * {@link OverwriteType}
     */
    type: OverwriteType;
    /**
     * Permission bit set
     *
     * See https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
     *
     * See https://en.wikipedia.org/wiki/Bit_field
     */
    allow: Permissions;
    /**
     * Permission bit set
     *
     * See https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
     *
     * See https://en.wikipedia.org/wiki/Bit_field
     */
    deny: Permissions;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum OverwriteType {
    Role = 0,
    Member = 1
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-structure
 *
 * Length limit: 6000 characters
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbed {
    /**
     * Title of embed
     *
     * Length limit: 256 characters
     */
    title?: string;
    /**
     * Type of embed (always "rich" for webhook embeds)
     */
    type?: EmbedType;
    /**
     * Description of embed
     *
     * Length limit: 4096 characters
     */
    description?: string;
    /**
     * URL of embed
     */
    url?: string;
    /**
     * Timestamp of embed content
     */
    timestamp?: string;
    /**
     * Color code of the embed
     */
    color?: number;
    /**
     * Footer information
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object-embed-footer-structure
     */
    footer?: APIEmbedFooter;
    /**
     * Image information
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object-embed-image-structure
     */
    image?: APIEmbedImage;
    /**
     * Thumbnail information
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object-embed-thumbnail-structure
     */
    thumbnail?: APIEmbedThumbnail;
    /**
     * Video information
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object-embed-video-structure
     */
    video?: APIEmbedVideo;
    /**
     * Provider information
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object-embed-provider-structure
     */
    provider?: APIEmbedProvider;
    /**
     * Author information
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object-embed-author-structure
     */
    author?: APIEmbedAuthor;
    /**
     * Fields information
     *
     * Length limit: 25 field objects
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object-embed-field-structure
     */
    fields?: APIEmbedField[];
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum EmbedType {
    /**
     * Generic embed rendered from embed attributes
     */
    Rich = "rich",
    /**
     * Image embed
     */
    Image = "image",
    /**
     * Video embed
     */
    Video = "video",
    /**
     * Animated gif image embed rendered as a video embed
     */
    GIFV = "gifv",
    /**
     * Article embed
     */
    Article = "article",
    /**
     * Link embed
     */
    Link = "link"
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-thumbnail-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbedThumbnail {
    /**
     * Source url of thumbnail (only supports http(s) and attachments)
     */
    url: string;
    /**
     * A proxied url of the thumbnail
     */
    proxy_url?: string;
    /**
     * Height of thumbnail
     */
    height?: number;
    /**
     * Width of thumbnail
     */
    width?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-video-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbedVideo {
    /**
     * Source url of video
     */
    url?: string;
    /**
     * Height of video
     */
    height?: number;
    /**
     * Width of video
     */
    width?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-image-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbedImage {
    /**
     * Source url of image (only supports http(s) and attachments)
     */
    url: string;
    /**
     * A proxied url of the image
     */
    proxy_url?: string;
    /**
     * Height of image
     */
    height?: number;
    /**
     * Width of image
     */
    width?: number;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-provider-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbedProvider {
    /**
     * Name of provider
     */
    name?: string;
    /**
     * URL of provider
     */
    url?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-author-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbedAuthor {
    /**
     * Name of author
     *
     * Length limit: 256 characters
     */
    name: string;
    /**
     * URL of author
     */
    url?: string;
    /**
     * URL of author icon (only supports http(s) and attachments)
     */
    icon_url?: string;
    /**
     * A proxied url of author icon
     */
    proxy_icon_url?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-footer-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbedFooter {
    /**
     * Footer text
     *
     * Length limit: 2048 characters
     */
    text: string;
    /**
     * URL of footer icon (only supports http(s) and attachments)
     */
    icon_url?: string;
    /**
     * A proxied url of footer icon
     */
    proxy_icon_url?: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#embed-object-embed-field-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIEmbedField {
    /**
     * Name of the field
     *
     * Length limit: 256 characters
     */
    name: string;
    /**
     * Value of the field
     *
     * Length limit: 1024 characters
     */
    value: string;
    /**
     * Whether or not this field should display inline
     */
    inline?: boolean;
}
/**
 * https://discord.com/developers/docs/resources/channel#attachment-object-attachment-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIAttachment {
    /**
     * Attachment id
     */
    id: Snowflake;
    /**
     * Name of file attached
     */
    filename: string;
    /**
     * Description for the file
     */
    description?: string;
    /**
     * The attachment's media type
     *
     * See https://en.wikipedia.org/wiki/Media_type
     */
    content_type?: string;
    /**
     * Size of file in bytes
     */
    size: number;
    /**
     * Source url of file
     */
    url: string;
    /**
     * A proxied url of file
     */
    proxy_url: string;
    /**
     * Height of file (if image)
     */
    height?: number | null;
    /**
     * Width of file (if image)
     */
    width?: number | null;
    /**
     * Whether this attachment is ephemeral
     */
    ephemeral?: boolean;
}
/**
 * https://discord.com/developers/docs/resources/channel#channel-mention-object-channel-mention-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIChannelMention {
    /**
     * ID of the channel
     */
    id: Snowflake;
    /**
     * ID of the guild containing the channel
     */
    guild_id: Snowflake;
    /**
     * The type of channel
     *
     * See https://discord.com/developers/docs/resources/channel#channel-object-channel-types
     */
    type: ChannelType;
    /**
     * The name of the channel
     */
    name: string;
}
/**
 * https://discord.com/developers/docs/resources/channel#allowed-mentions-object-allowed-mention-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum AllowedMentionsTypes {
    /**
     * Controls @everyone and @here mentions
     */
    Everyone = "everyone",
    /**
     * Controls role mentions
     */
    Role = "roles",
    /**
     * Controls user mentions
     */
    User = "users"
}
/**
 * https://discord.com/developers/docs/resources/channel#allowed-mentions-object-allowed-mentions-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIAllowedMentions {
    /**
     * An array of allowed mention types to parse from the content
     *
     * See https://discord.com/developers/docs/resources/channel#allowed-mentions-object-allowed-mention-types
     */
    parse?: AllowedMentionsTypes[];
    /**
     * Array of role_ids to mention (Max size of 100)
     */
    roles?: Snowflake[];
    /**
     * Array of user_ids to mention (Max size of 100)
     */
    users?: Snowflake[];
    /**
     * 	For replies, whether to mention the author of the message being replied to (default false)
     *
     * @default false
     */
    replied_user?: boolean;
}
/**
 * https://discord.com/developers/docs/interactions/message-components#component-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIBaseComponent<T extends ComponentType> {
    /**
     * The type of the component
     */
    type: T;
}
/**
 * https://discord.com/developers/docs/interactions/message-components#component-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum ComponentType {
    /**
     * Action Row component
     */
    ActionRow = 1,
    /**
     * Button component
     */
    Button = 2,
    /**
     * Select Menu component
     */
    SelectMenu = 3,
    /**
     * Text Input component
     */
    TextInput = 4
}
/**
 * https://discord.com/developers/docs/interactions/message-components#action-rows
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIActionRowComponent<T extends APIActionRowComponentTypes> extends APIBaseComponent<ComponentType.ActionRow> {
    /**
     * The components in the ActionRow
     */
    components: T[];
}
/**
 * https://discord.com/developers/docs/interactions/message-components#buttons
 */
interface APIButtonComponentBase<Style extends ButtonStyle> extends APIBaseComponent<ComponentType.Button> {
    /**
     * The label to be displayed on the button
     */
    label?: string;
    /**
     * The style of the button
     */
    style: Style;
    /**
     * The emoji to display to the left of the text
     */
    emoji?: APIMessageComponentEmoji;
    /**
     * The status of the button
     */
    disabled?: boolean;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIMessageComponentEmoji {
    /**
     * Emoji id
     */
    id?: Snowflake;
    /**
     * Emoji name
     */
    name?: string;
    /**
     * Whether this emoji is animated
     */
    animated?: boolean;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIButtonComponentWithCustomId extends APIButtonComponentBase<ButtonStyle.Danger | ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success> {
    /**
     * The custom_id to be sent in the interaction when clicked
     */
    custom_id: string;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIButtonComponentWithURL extends APIButtonComponentBase<ButtonStyle.Link> {
    /**
     * The URL to direct users to when clicked for Link buttons
     */
    url: string;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIButtonComponent = APIButtonComponentWithCustomId | APIButtonComponentWithURL;
/**
 * https://discord.com/developers/docs/interactions/message-components#button-object-button-styles
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum ButtonStyle {
    Primary = 1,
    Secondary = 2,
    Success = 3,
    Danger = 4,
    Link = 5
}
/**
 * https://discord.com/developers/docs/interactions/message-components#text-inputs-text-input-styles
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum TextInputStyle {
    Short = 1,
    Paragraph = 2
}
/**
 * https://discord.com/developers/docs/interactions/message-components#select-menus
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APISelectMenuComponent extends APIBaseComponent<ComponentType.SelectMenu> {
    /**
     * A developer-defined identifier for the select menu, max 100 characters
     */
    custom_id: string;
    /**
     * The choices in the select, max 25
     */
    options: APISelectMenuOption[];
    /**
     * Custom placeholder text if nothing is selected, max 100 characters
     */
    placeholder?: string;
    /**
     * The minimum number of items that must be chosen; min 0, max 25
     *
     * @default 1
     */
    min_values?: number;
    /**
     * The maximum number of items that can be chosen; max 25
     *
     * @default 1
     */
    max_values?: number;
    /**
     * Disable the select
     *
     * @default false
     */
    disabled?: boolean;
}
/**
 * https://discord.com/developers/docs/interactions/message-components#select-menu-object-select-option-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APISelectMenuOption {
    /**
     * The user-facing name of the option (max 25 chars)
     */
    label: string;
    /**
     * The dev-defined value of the option (max 100 chars)
     */
    value: string;
    /**
     * An additional description of the option (max 50 chars)
     */
    description?: string;
    /**
     * The emoji to display to the left of the option
     */
    emoji?: APIMessageComponentEmoji;
    /**
     * Whether this option should be already-selected by default
     */
    default?: boolean;
}
/**
 * https://discord.com/developers/docs/interactions/message-components#text-inputs-text-input-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APITextInputComponent extends APIBaseComponent<ComponentType.TextInput> {
    /**
     * One of text input styles
     */
    style: TextInputStyle;
    /**
     * The custom id for the text input
     */
    custom_id: string;
    /**
     * Text that appears on top of the text input field, max 45 characters
     */
    label: string;
    /**
     * Placeholder for the text input
     */
    placeholder?: string;
    /**
     * The pre-filled text in the text input
     */
    value?: string;
    /**
     * Minimal length of text input
     */
    min_length?: number;
    /**
     * Maximal length of text input
     */
    max_length?: number;
    /**
     * Whether or not this text input is required or not
     */
    required?: boolean;
}
/**
 * https://discord.com/developers/docs/interactions/message-components#message-components
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageComponent = APIActionRowComponent<APIMessageActionRowComponent> | APIMessageActionRowComponent;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIModalComponent = APIActionRowComponent<APIModalActionRowComponent> | APIModalActionRowComponent;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIActionRowComponentTypes = APIMessageActionRowComponent | APIModalActionRowComponent;
/**
 * https://discord.com/developers/docs/interactions/message-components#message-components
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIMessageActionRowComponent = APIButtonComponent | APISelectMenuComponent;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIModalActionRowComponent = APITextInputComponent;
export {};
//# sourceMappingURL=channel.d.ts.map