/**
 * Types extracted from https://discord.com/developers/docs/resources/audit-log
 */
import type { Snowflake } from '../../globals';
import type { APIOverwrite } from './channel';
import type { APIGuildIntegration, GuildDefaultMessageNotifications, GuildExplicitContentFilter, GuildMFALevel, GuildVerificationLevel, IntegrationExpireBehavior } from './guild';
import type { APIGuildScheduledEvent, GuildScheduledEventEntityType, GuildScheduledEventStatus } from './guildScheduledEvent';
import type { APIRole } from './permissions';
import type { StageInstancePrivacyLevel } from './stageInstance';
import type { StickerFormatType } from './sticker';
import type { APIUser } from './user';
import type { APIWebhook } from './webhook';
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-object-audit-log-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIAuditLog {
    /**
     * Webhooks found in the audit log
     *
     * See https://discord.com/developers/docs/resources/webhook#webhook-object
     */
    webhooks: APIWebhook[];
    /**
     * Users found in the audit log
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    users: APIUser[];
    /**
     * Audit log entries
     *
     * See https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object
     */
    audit_log_entries: APIAuditLogEntry[];
    /**
     * Partial integration objects
     *
     * See https://discord.com/developers/docs/resources/guild#integration-object
     */
    integrations: APIGuildIntegration[];
    /**
     * The guild scheduled events in the audit log
     *
     * See https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object
     */
    guild_scheduled_events: APIGuildScheduledEvent[];
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-entry-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIAuditLogEntry {
    /**
     * ID of the affected entity (webhook, user, role, etc.)
     */
    target_id: string | null;
    /**
     * Changes made to the `target_id`
     *
     * See https://discord.com/developers/docs/resources/audit-log#audit-log-change-object
     */
    changes?: APIAuditLogChange[];
    /**
     * The user who made the changes
     *
     * This can be `null` in some cases (webhooks deleting themselves by using their own token, for example)
     */
    user_id: Snowflake | null;
    /**
     * ID of the entry
     */
    id: Snowflake;
    /**
     * Type of action that occurred
     *
     * See https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-events
     */
    action_type: AuditLogEvent;
    /**
     * Additional info for certain action types
     *
     * See https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-optional-audit-entry-info
     */
    options?: APIAuditLogOptions;
    /**
     * The reason for the change (0-512 characters)
     */
    reason?: string;
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-events
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum AuditLogEvent {
    GuildUpdate = 1,
    ChannelCreate = 10,
    ChannelUpdate = 11,
    ChannelDelete = 12,
    ChannelOverwriteCreate = 13,
    ChannelOverwriteUpdate = 14,
    ChannelOverwriteDelete = 15,
    MemberKick = 20,
    MemberPrune = 21,
    MemberBanAdd = 22,
    MemberBanRemove = 23,
    MemberUpdate = 24,
    MemberRoleUpdate = 25,
    MemberMove = 26,
    MemberDisconnect = 27,
    BotAdd = 28,
    RoleCreate = 30,
    RoleUpdate = 31,
    RoleDelete = 32,
    InviteCreate = 40,
    InviteUpdate = 41,
    InviteDelete = 42,
    WebhookCreate = 50,
    WebhookUpdate = 51,
    WebhookDelete = 52,
    EmojiCreate = 60,
    EmojiUpdate = 61,
    EmojiDelete = 62,
    MessageDelete = 72,
    MessageBulkDelete = 73,
    MessagePin = 74,
    MessageUnpin = 75,
    IntegrationCreate = 80,
    IntegrationUpdate = 81,
    IntegrationDelete = 82,
    StageInstanceCreate = 83,
    StageInstanceUpdate = 84,
    StageInstanceDelete = 85,
    StickerCreate = 90,
    StickerUpdate = 91,
    StickerDelete = 92,
    GuildScheduledEventCreate = 100,
    GuildScheduledEventUpdate = 101,
    GuildScheduledEventDelete = 102
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-optional-audit-entry-info
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIAuditLogOptions {
    /**
     * Number of days after which inactive members were kicked
     *
     * Present from:
     * - MEMBER_PRUNE
     */
    delete_member_days?: string;
    /**
     * Number of members removed by the prune
     *
     * Present from:
     * - MEMBER_PRUNE
     */
    members_removed?: string;
    /**
     * Channel in which the entities were targeted
     *
     * Present from:
     * - MEMBER_MOVE
     * - MESSAGE_PIN
     * - MESSAGE_UNPIN
     * - MESSAGE_DELETE
     * - STAGE_INSTANCE_CREATE
     * - STAGE_INSTANCE_UPDATE
     * - STAGE_INSTANCE_DELETE
     */
    channel_id?: Snowflake;
    /**
     * ID of the message that was targeted
     *
     * Present from:
     * - MESSAGE_PIN
     * - MESSAGE_UNPIN
     */
    message_id?: Snowflake;
    /**
     * Number of entities that were targeted
     *
     * Present from:
     * - MESSAGE_DELETE
     * - MESSAGE_BULK_DELETE
     * - MEMBER_DISCONNECT
     * - MEMBER_MOVE
     */
    count?: string;
    /**
     * ID of the overwritten entity
     *
     * Present from:
     * - CHANNEL_OVERWRITE_CREATE
     * - CHANNEL_OVERWRITE_UPDATE
     * - CHANNEL_OVERWRITE_DELETE
     */
    id?: Snowflake;
    /**
     * Type of overwritten entity - "0" for "role" or "1" for "member"
     *
     * Present from:
     * - CHANNEL_OVERWRITE_CREATE
     * - CHANNEL_OVERWRITE_UPDATE
     * - CHANNEL_OVERWRITE_DELETE
     *
     * {@link AuditLogOptionsType}
     */
    type?: AuditLogOptionsType;
    /**
     * Name of the role
     *
     * Present from:
     * - CHANNEL_OVERWRITE_CREATE
     * - CHANNEL_OVERWRITE_UPDATE
     * - CHANNEL_OVERWRITE_DELETE
     *
     * **Present only if the {@link APIAuditLogOptions#type entry type} is "0"**
     */
    role_name?: string;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum AuditLogOptionsType {
    Role = "0",
    Member = "1"
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-change-object-audit-log-change-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChange = APIAuditLogChangeKey$Add | APIAuditLogChangeKey$Remove | APIAuditLogChangeKeyAFKChannelId | APIAuditLogChangeKeyAFKTimeout | APIAuditLogChangeKeyAllow | APIAuditLogChangeKeyApplicationId | APIAuditLogChangeKeyAsset | APIAuditLogChangeKeyAvailable | APIAuditLogChangeKeyAvatarHash | APIAuditLogChangeKeyBannerHash | APIAuditLogChangeKeyBitrate | APIAuditLogChangeKeyChannelId | APIAuditLogChangeKeyCode | APIAuditLogChangeKeyColor | APIAuditLogChangeKeyCommunicationDisabledUntil | APIAuditLogChangeKeyDeaf | APIAuditLogChangeKeyDefaultMessageNotifications | APIAuditLogChangeKeyDeny | APIAuditLogChangeKeyDescription | APIAuditLogChangeKeyDiscoverySplashHash | APIAuditLogChangeKeyEnableEmoticons | APIAuditLogChangeKeyEntityType | APIAuditLogChangeKeyExpireBehavior | APIAuditLogChangeKeyExpireGracePeriod | APIAuditLogChangeKeyExplicitContentFilter | APIAuditLogChangeKeyFormatType | APIAuditLogChangeKeyGuildId | APIAuditLogChangeKeyHoist | APIAuditLogChangeKeyIconHash | APIAuditLogChangeKeyId | APIAuditLogChangeKeyInviterId | APIAuditLogChangeKeyLocation | APIAuditLogChangeKeyMaxAge | APIAuditLogChangeKeyMaxUses | APIAuditLogChangeKeyMentionable | APIAuditLogChangeKeyMFALevel | APIAuditLogChangeKeyMute | APIAuditLogChangeKeyName | APIAuditLogChangeKeyNick | APIAuditLogChangeKeyNSFW | APIAuditLogChangeKeyOwnerId | APIAuditLogChangeKeyPermissionOverwrites | APIAuditLogChangeKeyPermissions | APIAuditLogChangeKeyPosition | APIAuditLogChangeKeyPreferredLocale | APIAuditLogChangeKeyPrivacyLevel | APIAuditLogChangeKeyPruneDeleteDays | APIAuditLogChangeKeyPublicUpdatesChannelId | APIAuditLogChangeKeyRateLimitPerUser | APIAuditLogChangeKeyRegion | APIAuditLogChangeKeyRulesChannelId | APIAuditLogChangeKeySplashHash | APIAuditLogChangeKeyStatus | APIAuditLogChangeKeySystemChannelId | APIAuditLogChangeKeyTags | APIAuditLogChangeKeyTemporary | APIAuditLogChangeKeyTopic | APIAuditLogChangeKeyType | APIAuditLogChangeKeyUserLimit | APIAuditLogChangeKeyUses | APIAuditLogChangeKeyVanityURLCode | APIAuditLogChangeKeyVerificationLevel | APIAuditLogChangeKeyWidgetChannelId | APIAuditLogChangeKeyWidgetEnabled;
/**
 * Returned when an entity's name is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyName = AuditLogChangeData<'name', string>;
/**
 * Returned when a guild's or sticker's or guild scheduled event's description is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyDescription = AuditLogChangeData<'description', string>;
/**
 * Returned when a guild's icon is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyIconHash = AuditLogChangeData<'icon_hash', string>;
/**
 * Returned when a guild's splash is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeySplashHash = AuditLogChangeData<'splash_hash', string>;
/**
 * Returned when a guild's discovery splash is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyDiscoverySplashHash = AuditLogChangeData<'discovery_splash_hash', string>;
/**
 * Returned when a guild's banner hash is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyBannerHash = AuditLogChangeData<'banner_hash', string>;
/**
 * Returned when a guild's owner_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyOwnerId = AuditLogChangeData<'owner_id', Snowflake>;
/**
 * Returned when a guild's region is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyRegion = AuditLogChangeData<'region', string>;
/**
 * Returned when a guild's preferred_locale is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyPreferredLocale = AuditLogChangeData<'preferred_locale', string>;
/**
 * Returned when a guild's afk_channel_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyAFKChannelId = AuditLogChangeData<'afk_channel_id', Snowflake>;
/**
 * Returned when a guild's afk_timeout is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyAFKTimeout = AuditLogChangeData<'afk_timeout', number>;
/**
 * Returned when a guild's rules_channel_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyRulesChannelId = AuditLogChangeData<'rules_channel_id', string>;
/**
 * Returned when a guild's public_updates_channel_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyPublicUpdatesChannelId = AuditLogChangeData<'public_updates_channel_id', string>;
/**
 * Returned when a guild's mfa_level is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyMFALevel = AuditLogChangeData<'mfa_level', GuildMFALevel>;
/**
 * Returned when a guild's verification_level is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyVerificationLevel = AuditLogChangeData<'verification_level', GuildVerificationLevel>;
/**
 * Returned when a guild's explicit_content_filter is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyExplicitContentFilter = AuditLogChangeData<'explicit_content_filter', GuildExplicitContentFilter>;
/**
 * Returned when a guild's default_message_notifications is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyDefaultMessageNotifications = AuditLogChangeData<'default_message_notifications', GuildDefaultMessageNotifications>;
/**
 * Returned when a guild's vanity_url_code is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyVanityURLCode = AuditLogChangeData<'vanity_url_code', string>;
/**
 * Returned when new role(s) are added
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKey$Add = AuditLogChangeData<'$add', APIRole[]>;
/**
 * Returned when role(s) are removed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKey$Remove = AuditLogChangeData<'$remove', APIRole[]>;
/**
 * Returned when there is a change in number of days after which inactive and role-unassigned members are kicked
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyPruneDeleteDays = AuditLogChangeData<'prune_delete_days', number>;
/**
 * Returned when a guild's widget is enabled
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyWidgetEnabled = AuditLogChangeData<'widget_enabled', boolean>;
/**
 * Returned when a guild's widget_channel_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyWidgetChannelId = AuditLogChangeData<'widget_channel_id', Snowflake>;
/**
 * Returned when a guild's system_channel_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeySystemChannelId = AuditLogChangeData<'system_channel_id', Snowflake>;
/**
 * Returned when a channel's position is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyPosition = AuditLogChangeData<'position', number>;
/**
 * Returned when a channel's topic is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyTopic = AuditLogChangeData<'topic', string>;
/**
 * Returned when a voice channel's bitrate is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyBitrate = AuditLogChangeData<'bitrate', number>;
/**
 * Returned when a channel's permission overwrites is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyPermissionOverwrites = AuditLogChangeData<'permission_overwrites', APIOverwrite[]>;
/**
 * Returned when a channel's NSFW restriction is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyNSFW = AuditLogChangeData<'nsfw', boolean>;
/**
 * The application ID of the added or removed Webhook or Bot
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyApplicationId = AuditLogChangeData<'application_id', Snowflake>;
/**
 * Returned when a channel's amount of seconds a user has to wait before sending another message
 * is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyRateLimitPerUser = AuditLogChangeData<'rate_limit_per_user', number>;
/**
 * Returned when a permission bitfield is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyPermissions = AuditLogChangeData<'permissions', string>;
/**
 * Returned when a role's color is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyColor = AuditLogChangeData<'color', number>;
/**
 * Returned when a role's hoist status is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyHoist = AuditLogChangeData<'hoist', boolean>;
/**
 * Returned when a role's mentionable status is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyMentionable = AuditLogChangeData<'mentionable', boolean>;
/**
 * Returned when an overwrite's allowed permissions bitfield is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyAllow = AuditLogChangeData<'allow', string>;
/**
 * Returned when an overwrite's denied permissions bitfield is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyDeny = AuditLogChangeData<'deny', string>;
/**
 * Returned when an invite's code is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyCode = AuditLogChangeData<'code', string>;
/**
 * Returned when an invite's or guild scheduled event's channel_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyChannelId = AuditLogChangeData<'channel_id', Snowflake>;
/**
 * Returned when an invite's inviter_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyInviterId = AuditLogChangeData<'inviter_id', Snowflake>;
/**
 * Returned when an invite's max_uses is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyMaxUses = AuditLogChangeData<'max_uses', number>;
/**
 * Returned when an invite's uses is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyUses = AuditLogChangeData<'uses', number>;
/**
 * Returned when an invite's max_age is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyMaxAge = AuditLogChangeData<'max_age', number>;
/**
 * Returned when an invite's temporary status is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyTemporary = AuditLogChangeData<'temporary', boolean>;
/**
 * Returned when a user's deaf status is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyDeaf = AuditLogChangeData<'deaf', boolean>;
/**
 * Returned when a user's mute status is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyMute = AuditLogChangeData<'mute', boolean>;
/**
 * Returned when a user's nick is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyNick = AuditLogChangeData<'nick', string>;
/**
 * Returned when a user's avatar_hash is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyAvatarHash = AuditLogChangeData<'avatar_hash', string>;
/**
 * The ID of the changed entity - sometimes used in conjunction with other keys
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyId = AuditLogChangeData<'id', Snowflake>;
/**
 * The type of entity created
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyType = AuditLogChangeData<'type', number | string>;
/**
 * Returned when an integration's enable_emoticons is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyEnableEmoticons = AuditLogChangeData<'enable_emoticons', boolean>;
/**
 * Returned when an integration's expire_behavior is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyExpireBehavior = AuditLogChangeData<'expire_behavior', IntegrationExpireBehavior>;
/**
 * Returned when an integration's expire_grace_period is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyExpireGracePeriod = AuditLogChangeData<'expire_grace_period', number>;
/**
 * Returned when a voice channel's user_limit is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyUserLimit = AuditLogChangeData<'user_limit', number>;
/**
 * Returned when privacy level of a stage instance or guild scheduled event is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyPrivacyLevel = AuditLogChangeData<'privacy_level', StageInstancePrivacyLevel>;
/**
 * Returned when a sticker's related emoji is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyTags = AuditLogChangeData<'tags', string>;
/**
 * Returned when a sticker's format_type is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyFormatType = AuditLogChangeData<'format_type', StickerFormatType>;
/**
 * Empty string
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyAsset = AuditLogChangeData<'asset', ''>;
/**
 * Returned when a sticker's availability is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyAvailable = AuditLogChangeData<'available', boolean>;
/**
 * Returned when a sticker's guild_id is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyGuildId = AuditLogChangeData<'guild_id', Snowflake>;
/**
 * Returned when entity type of a guild scheduled event is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyEntityType = AuditLogChangeData<'entity_type', GuildScheduledEventEntityType>;
/**
 * Returned when status of a guild scheduled event is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyStatus = AuditLogChangeData<'status', GuildScheduledEventStatus>;
/**
 * Returned when location of a guild scheduled event is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyLocation = AuditLogChangeData<'location', string>;
/**
 * Returned when a user's timeout is changed
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIAuditLogChangeKeyCommunicationDisabledUntil = AuditLogChangeData<'communication_disabled_until', string>;
interface AuditLogChangeData<K extends string, D> {
    key: K;
    /**
     * The new value
     *
     * If `new_value` is not present in the change object, while `old_value` is,
     * that means the property that was changed has been reset, or set to `null`
     */
    new_value?: D;
    old_value?: D;
}
export {};
//# sourceMappingURL=auditLog.d.ts.map