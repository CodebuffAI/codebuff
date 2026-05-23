import type { Permissions, Snowflake } from '../../globals';
import type { APIAllowedMentions, APIChannel, APIEmbed, APIExtendedInvite, APIFollowedChannel, APIMessage, APIMessageReference, APIThreadList, APIThreadMember, APIUser, ChannelType, InviteTargetType, MessageFlags, OverwriteType, ThreadAutoArchiveDuration, ThreadChannelType, VideoQualityMode, APIGuildForumTag, APIGuildForumDefaultReactionEmoji, SortOrderType, ForumLayoutType, ChannelFlags, APIAttachment, APIMessageTopLevelComponent, APIMessagePin, APIAnnouncementThreadChannel, APIPrivateThreadChannel, APIPublicThreadChannel } from '../../payloads/v10/index';
import type { _AddUndefinedToPossiblyUndefinedPropertiesOfInterface, _StrictPartial } from '../../utils/internals';
import type { RESTAPIPoll } from './poll';
export interface RESTAPIChannelPatchOverwrite extends RESTPutAPIChannelPermissionJSONBody {
    id: Snowflake;
}
/**
 * @deprecated Use {@link RESTAPIChannelPatchOverwrite} instead
 */
export type APIChannelPatchOverwrite = RESTAPIChannelPatchOverwrite;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-channel}
 */
export type RESTGetAPIChannelResult = APIChannel;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#modify-channel}
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
    type?: ChannelType.GuildAnnouncement | ChannelType.GuildText | undefined;
    /**
     * The position of the channel in the left-hand listing
     *
     * Channel types: all excluding newsThread, publicThread, privateThread
     */
    position?: number | null | undefined;
    /**
     * 0-1024 character channel topic (0-4096 characters for thread-only channels)
     *
     * Channel types: text, news, forum, media
     */
    topic?: string | null | undefined;
    /**
     * Whether the channel is nsfw
     *
     * Channel types: text, voice, news, forum, media
     */
    nsfw?: boolean | null | undefined;
    /**
     * Amount of seconds a user has to wait before sending another message (0-21600);
     * bots, as well as users with the permission `MANAGE_MESSAGES` or `MANAGE_CHANNELS`,
     * are unaffected
     *
     * Channel types: text, newsThread, publicThread, privateThread, forum, media
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
     * Channel types: all excluding newsThread, publicThread, privateThread
     */
    permission_overwrites?: RESTAPIChannelPatchOverwrite[] | null | undefined;
    /**
     * ID of the new parent category for a channel
     *
     * Channel types: text, voice, news, stage, forum, media
     */
    parent_id?: Snowflake | null | undefined;
    /**
     * Voice region id for the voice or stage channel, automatic when set to `null`
     *
     * @see {@link https://discord.com/developers/docs/resources/voice#voice-region-object}
     */
    rtc_region?: string | null | undefined;
    /**
     * The camera video quality mode of the voice channel
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#channel-object-video-quality-modes}
     */
    video_quality_mode?: VideoQualityMode | null | undefined;
    /**
     * Whether the thread should be archived
     *
     * Channel types: newsThread, publicThread, privateThread
     */
    archived?: boolean | undefined;
    /**
     * The amount of time in minutes to wait before automatically archiving the thread
     *
     * Channel types: newsThread, publicThread, privateThread
     */
    auto_archive_duration?: ThreadAutoArchiveDuration | undefined;
    /**
     * Whether the thread should be locked
     *
     * Channel types: newsThread, publicThread, privateThread
     */
    locked?: boolean | undefined;
    /**
     * Default duration for newly created threads, in minutes, to automatically archive the thread after recent activity
     *
     * Channel types: text, news, forum, media
     */
    default_auto_archive_duration?: ThreadAutoArchiveDuration | undefined;
    /**
     * Channel flags combined as a bit field.
     */
    flags?: ChannelFlags | undefined;
    /**
     * The set of tags that can be used in a thread-only channel; limited to 20
     *
     * Channel types: forum, media
     */
    available_tags?: (Partial<APIGuildForumTag> & Pick<APIGuildForumTag, 'name'>)[] | undefined;
    /**
     * Whether non-moderators can add other non-moderators to the thread
     *
     * Channel types: privateThread
     */
    invitable?: boolean | undefined;
    /**
     * The emoji to show in the add reaction button on a thread in a thread-only channel
     *
     * Channel types: forum, media
     */
    default_reaction_emoji?: APIGuildForumDefaultReactionEmoji | undefined;
    /**
     * The initial `rate_limit_per_user` to set on newly created threads in a channel.
     * This field is copied to the thread at creation time and does not live update
     *
     * Channel types: text, forum, media
     */
    default_thread_rate_limit_per_user?: number | null | undefined;
    /**
     * The default sort order type used to order posts in a thread-only channel
     *
     * Channel types: forum, media
     */
    default_sort_order?: SortOrderType | null | undefined;
    /**
     * The default layout type used to display posts in a forum channel
     *
     * Channel types: forum
     */
    default_forum_layout?: ForumLayoutType | undefined;
    /**
     * The ids of the set of tags that have been applied to a thread-only channel; limited to 5
     *
     * Channel types: forum, media
     */
    applied_tags?: Snowflake[] | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#modify-channel}
 */
export type RESTPatchAPIChannelResult = APIChannel;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#deleteclose-channel}
 */
export type RESTDeleteAPIChannelResult = APIChannel;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-channel-messages}
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
     * @defaultValue `50`
     */
    limit?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-channel-messages}
 */
export type RESTGetAPIChannelMessagesResult = APIMessage[];
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-channel-message}
 */
export type RESTGetAPIChannelMessageResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#message-reference-object-message-reference-structure}
 */
export type RESTAPIMessageReference = _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Required<Pick<APIMessageReference, 'message_id'>>> & _StrictPartial<APIMessageReference> & {
    /**
     * Whether to error if the referenced message doesn't exist instead of sending as a normal (non-reply) message
     *
     * @defaultValue `true`
     */
    fail_if_not_exists?: boolean | undefined;
};
/**
 * @deprecated Use {@link RESTAPIMessageReference} instead
 */
export type APIMessageReferenceSend = RESTAPIMessageReference;
/**
 * @see {@link https://discord.com/developers/docs/resources/message#attachment-object-attachment-structure}
 */
export type RESTAPIAttachment = Partial<Pick<APIAttachment, 'description' | 'duration_secs' | 'filename' | 'title' | 'waveform'>> & {
    /**
     * Attachment id or a number that matches `n` in `files[n]`
     */
    id: Snowflake | number;
};
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#create-message}
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
     * @see {@link https://discord.com/developers/docs/resources/channel#embed-object}
     */
    embeds?: APIEmbed[] | undefined;
    /**
     * Allowed mentions for a message
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#allowed-mentions-object}
     */
    allowed_mentions?: APIAllowedMentions | undefined;
    /**
     * Include to make your message a reply or a forward
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#message-reference-object-message-reference-structure}
     */
    message_reference?: RESTAPIMessageReference | undefined;
    /**
     * The components to include with the message
     *
     * @see {@link https://discord.com/developers/docs/components/reference}
     */
    components?: APIMessageTopLevelComponent[] | undefined;
    /**
     * IDs of up to 3 stickers in the server to send in the message
     *
     * @see {@link https://discord.com/developers/docs/resources/sticker#sticker-object}
     */
    sticker_ids?: [Snowflake, Snowflake, Snowflake] | [Snowflake, Snowflake] | [Snowflake] | undefined;
    /**
     * Attachment objects with filename and description
     */
    attachments?: RESTAPIAttachment[] | undefined;
    /**
     * Message flags combined as a bitfield
     */
    flags?: MessageFlags | undefined;
    /**
     * If `true` and nonce is present, it will be checked for uniqueness in the past few minutes.
     * If another message was created by the same author with the same nonce, that message will be returned and no new message will be created.
     */
    enforce_nonce?: boolean | undefined;
    /**
     * A poll!
     */
    poll?: RESTAPIPoll | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#create-message}
 */
export type RESTPostAPIChannelMessageFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPostAPIChannelMessageJSONBody);
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#create-message}
 */
export type RESTPostAPIChannelMessageResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#crosspost-message}
 */
export type RESTPostAPIChannelMessageCrosspostResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#create-reaction}
 */
export type RESTPutAPIChannelMessageReactionResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#delete-own-reaction}
 */
export type RESTDeleteAPIChannelMessageOwnReactionResult = never;
/**
 * @deprecated Use {@link RESTDeleteAPIChannelMessageOwnReactionResult} instead
 */
export type RESTDeleteAPIChannelMessageOwnReaction = RESTDeleteAPIChannelMessageOwnReactionResult;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#delete-user-reaction}
 */
export type RESTDeleteAPIChannelMessageUserReactionResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-reactions}
 */
export interface RESTGetAPIChannelMessageReactionUsersQuery {
    /**
     * The reaction type
     */
    type?: ReactionType;
    /**
     * Get users after this user ID
     */
    after?: Snowflake;
    /**
     * Max number of users to return (1-100)
     *
     * @defaultValue `25`
     */
    limit?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-reactions-reaction-types}
 */
export declare enum ReactionType {
    Normal = 0,
    Super = 1
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-reactions}
 */
export type RESTGetAPIChannelMessageReactionUsersResult = APIUser[];
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#delete-all-reactions}
 */
export type RESTDeleteAPIChannelAllMessageReactionsResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#delete-all-reactions-for-emoji}
 */
export type RESTDeleteAPIChannelMessageReactionResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#edit-message}
 */
export interface RESTPatchAPIChannelMessageJSONBody {
    /**
     * The new message contents (up to 2000 characters)
     */
    content?: string | null | undefined;
    /**
     * Embedded `rich` content (up to 6000 characters)
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#embed-object}
     */
    embeds?: APIEmbed[] | null | undefined;
    /**
     * Edit the flags of a message (only `SUPPRESS_EMBEDS` can currently be set/unset)
     *
     * When specifying flags, ensure to include all previously set flags/bits
     * in addition to ones that you are modifying
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#message-object-message-flags}
     */
    flags?: MessageFlags | null | undefined;
    /**
     * Allowed mentions for the message
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#allowed-mentions-object}
     */
    allowed_mentions?: APIAllowedMentions | null | undefined;
    /**
     * Attached files to keep
     *
     * Starting with API v10, the `attachments` array must contain all attachments that should be present after edit, including **retained and new** attachments provided in the request body.
     *
     * @see {@link https://discord.com/developers/docs/resources/message#attachment-object-attachment-structure}
     */
    attachments?: RESTAPIAttachment[] | undefined;
    /**
     * The components to include with the message
     *
     * @see {@link https://discord.com/developers/docs/components/reference}
     */
    components?: APIMessageTopLevelComponent[] | null | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#edit-message}
 */
export type RESTPatchAPIChannelMessageFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPatchAPIChannelMessageJSONBody);
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#edit-message}
 */
export type RESTPatchAPIChannelMessageResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#delete-message}
 */
export type RESTDeleteAPIChannelMessageResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#bulk-delete-messages}
 */
export interface RESTPostAPIChannelMessagesBulkDeleteJSONBody {
    /**
     * An array of message ids to delete (2-100)
     */
    messages: Snowflake[];
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#bulk-delete-messages}
 */
export type RESTPostAPIChannelMessagesBulkDeleteResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#edit-channel-permissions}
 */
export interface RESTPutAPIChannelPermissionJSONBody {
    /**
     * The bitwise value of all allowed permissions
     *
     * @see {@link https://en.wikipedia.org/wiki/Bit_field}
     * @defaultValue `"0"`
     */
    allow?: Permissions | null | undefined;
    /**
     * The bitwise value of all disallowed permissions
     *
     * @see {@link https://en.wikipedia.org/wiki/Bit_field}
     * @defaultValue `"0"`
     */
    deny?: Permissions | null | undefined;
    /**
     * `0` for a role or `1` for a member
     */
    type: OverwriteType;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#edit-channel-permissions}
 */
export type RESTPutAPIChannelPermissionResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-channel-invites}
 */
export type RESTGetAPIChannelInvitesResult = APIExtendedInvite[];
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#create-channel-invite}
 */
export interface RESTPostAPIChannelInviteJSONBody {
    /**
     * Duration of invite in seconds before expiry, or 0 for never
     *
     * @defaultValue `86400` (24 hours)
     */
    max_age?: number | undefined;
    /**
     * Max number of uses or 0 for unlimited
     *
     * @defaultValue `0`
     */
    max_uses?: number | undefined;
    /**
     * Whether this invite only grants temporary membership
     *
     * @defaultValue `false`
     */
    temporary?: boolean | undefined;
    /**
     * If true, don't try to reuse a similar invite
     * (useful for creating many unique one time use invites)
     *
     * @defaultValue `false`
     */
    unique?: boolean | undefined;
    /**
     * The type of target for this voice channel invite
     *
     * @see {@link https://discord.com/developers/docs/resources/invite#invite-object-invite-target-types}
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
 * @see {@link https://discord.com/developers/docs/resources/channel#create-channel-invite}
 */
export type RESTPostAPIChannelInviteResult = APIExtendedInvite;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#delete-channel-permission}
 */
export type RESTDeleteAPIChannelPermissionResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#follow-news-channel}
 */
export interface RESTPostAPIChannelFollowersJSONBody {
    /**
     * ID of target channel
     */
    webhook_channel_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#follow-news-channel}
 */
export type RESTPostAPIChannelFollowersResult = APIFollowedChannel;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#trigger-typing-indicator}
 */
export type RESTPostAPIChannelTypingResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/message#get-channel-pins}
 */
export interface RESTGetAPIChannelMessagesPinsQuery {
    /**
     * Get messages pinned before this timestamp
     */
    before?: string;
    /**
     * Maximum number of pins to return (1-50).
     *
     * @defaultValue `50`
     */
    limit?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/message#get-channel-pins}
 */
export interface RESTGetAPIChannelMessagesPinsResult {
    /**
     * Array of pinned messages
     */
    items: APIMessagePin[];
    /**
     * Whether there are more items available
     */
    has_more: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/message#pin-message}
 */
export type RESTPutAPIChannelMessagesPinResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/message#unpin-message}
 */
export type RESTDeleteAPIChannelMessagesPinResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/message#get-pinned-messages-deprecated}
 * @deprecated
 */
export type RESTGetAPIChannelPinsResult = APIMessage[];
/**
 * @see {@link https://discord.com/developers/docs/resources/message#pin-message-deprecated}
 * @deprecated
 */
export type RESTPutAPIChannelPinResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/message#unpin-message-deprecated}
 * @deprecated
 */
export type RESTDeleteAPIChannelPinResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#group-dm-add-recipient}
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
 * @see {@link https://discord.com/developers/docs/resources/channel#group-dm-add-recipient}
 */
export type RESTPutAPIChannelRecipientResult = unknown;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#group-dm-remove-recipient}
 */
export type RESTDeleteAPIChannelRecipientResult = unknown;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#start-thread-from-message}
 */
export interface RESTPostAPIChannelMessagesThreadsJSONBody {
    /**
     * 1-100 character thread name
     */
    name: string;
    /**
     * The amount of time in minutes to wait before automatically archiving the thread
     */
    auto_archive_duration?: ThreadAutoArchiveDuration | undefined;
    /**
     * Amount of seconds a user has to wait before sending another message (0-21600)
     */
    rate_limit_per_user?: number | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#start-thread-in-forum-or-media-channel}
 */
export type RESTPostAPIGuildForumThreadsJSONBody = RESTPostAPIChannelMessagesThreadsJSONBody & {
    /**
     * The initial message of the thread
     */
    message: RESTPostAPIChannelMessageJSONBody;
    /**
     * The IDs of the set of tags to apply to the thread; limited to 5
     */
    applied_tags?: Snowflake[] | undefined;
};
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#start-thread-in-forum-or-media-channel}
 */
export type RESTPostAPIGuildForumThreadsFormDataBody = RESTPostAPIChannelMessagesThreadsJSONBody & {
    /**
     * The initial message of the thread
     */
    message: string;
};
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#start-thread-from-message}
 */
export type RESTPostAPIChannelMessagesThreadsResult = APIChannel;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#start-thread-without-message}
 */
export interface RESTPostAPIChannelThreadsJSONBody extends RESTPostAPIChannelMessagesThreadsJSONBody {
    /**
     * The type of thread to create
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#channel-object-channel-types}
     * @defaultValue `ChannelType.PrivateThread` in API v9 and v10.
     * In a future API version this will be changed to be a required field, with no default.
     */
    type?: ThreadChannelType | undefined;
    /**
     * Whether non-moderators can add other non-moderators to the thread; only available when creating a private thread
     */
    invitable?: boolean | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#start-thread-without-message}
 */
export type RESTPostAPIChannelThreadsResult = APIAnnouncementThreadChannel | APIPrivateThreadChannel | APIPublicThreadChannel;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#join-thread}
 */
export type RESTPutAPIChannelThreadMembersResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#leave-thread}
 */
export type RESTDeleteAPIChannelThreadMembersResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-thread-member}
 */
export interface RESTGetAPIChannelThreadMemberQuery {
    /**
     * Whether to include a guild member object for the thread member
     */
    with_member?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#get-thread-member}
 */
export type RESTGetAPIChannelThreadMemberResult = APIThreadMember;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#list-thread-members}
 */
export interface RESTGetAPIChannelThreadMembersQuery {
    /**
     * Whether to include a guild member object for each thread member
     */
    with_member?: boolean;
    /**
     * Get thread members after this user ID
     */
    after?: Snowflake;
    /**
     * Max number of thread members to return (1-100)
     *
     * @defaultValue `100`
     */
    limit?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#list-thread-members}
 */
export type RESTGetAPIChannelThreadMembersResult = APIThreadMember[];
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#list-public-archived-threads}
 */
export interface RESTGetAPIChannelThreadsArchivedQuery {
    /**
     * Get threads before this id or ISO8601 timestamp
     */
    before?: Snowflake | string;
    /**
     * Max number of thread to return
     */
    limit?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#list-public-archived-threads}
 */
export type RESTGetAPIChannelThreadsArchivedPublicResult = RESTGetAPIChannelUsersThreadsArchivedResult;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#list-private-archived-threads}
 */
export type RESTGetAPIChannelThreadsArchivedPrivateResult = RESTGetAPIChannelUsersThreadsArchivedResult;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#list-joined-private-archived-threads}
 */
export interface RESTGetAPIChannelUsersThreadsArchivedResult extends APIThreadList {
    /**
     * Whether there are potentially additional threads
     */
    has_more: boolean;
}
//# sourceMappingURL=channel.d.ts.map