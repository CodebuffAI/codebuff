/**
 * Types extracted from https://discord.com/developers/docs/resources/audit-log
 */
import type { APIOverwrite, ChannelType } from './channel';
import type { APIGuildIntegration, GuildDefaultMessageNotifications, GuildExplicitContentFilter, GuildMFALevel, GuildVerificationLevel, IntegrationExpireBehavior } from './guild';
import type { APIRole } from './permissions';
import type { APIUser } from './user';
import type { APIWebhook } from './webhook';
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-object-audit-log-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIAuditLog {
    webhooks: APIWebhook[];
    users: APIUser[];
    audit_log_entries: APIAuditLogEntry[];
    integrations: APIGuildIntegration[];
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-entry-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIAuditLogEntry {
    target_id: string | null;
    changes?: APIAuditLogChange[];
    user_id: string | null;
    id: string;
    action_type: AuditLogEvent;
    options?: APIAuditLogOptions;
    reason?: string;
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-events
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum AuditLogEvent {
    GUILD_UPDATE = 1,
    CHANNEL_CREATE = 10,
    CHANNEL_UPDATE = 11,
    CHANNEL_DELETE = 12,
    CHANNEL_OVERWRITE_CREATE = 13,
    CHANNEL_OVERWRITE_UPDATE = 14,
    CHANNEL_OVERWRITE_DELETE = 15,
    MEMBER_KICK = 20,
    MEMBER_PRUNE = 21,
    MEMBER_BAN_ADD = 22,
    MEMBER_BAN_REMOVE = 23,
    MEMBER_UPDATE = 24,
    MEMBER_ROLE_UPDATE = 25,
    MEMBER_MOVE = 26,
    MEMBER_DISCONNECT = 27,
    BOT_ADD = 28,
    ROLE_CREATE = 30,
    ROLE_UPDATE = 31,
    ROLE_DELETE = 32,
    INVITE_CREATE = 40,
    INVITE_UPDATE = 41,
    INVITE_DELETE = 42,
    WEBHOOK_CREATE = 50,
    WEBHOOK_UPDATE = 51,
    WEBHOOK_DELETE = 52,
    EMOJI_CREATE = 60,
    EMOJI_UPDATE = 61,
    EMOJI_DELETE = 62,
    MESSAGE_DELETE = 72,
    MESSAGE_BULK_DELETE = 73,
    MESSAGE_PIN = 74,
    MESSAGE_UNPIN = 75,
    INTEGRATION_CREATE = 80,
    INTEGRATION_UPDATE = 81,
    INTEGRATION_DELETE = 82
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-optional-audit-entry-info
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIAuditLogOptions {
    /**
     * Present from:
     * - MEMBER_PRUNE
     */
    delete_member_days?: string;
    /**
     * Present from:
     * - MEMBER_PRUNE
     */
    members_removed?: string;
    /**
     * Present from:
     * - MEMBER_MOVE
     * - MESSAGE_PIN
     * - MESSAGE_UNPIN
     * - MESSAGE_DELETE
     */
    channel_id?: string;
    /**
     * Present from:
     * - MESSAGE_PIN
     * - MESSAGE_UNPIN
     */
    message_id?: string;
    /**
     * Present from:
     * - MESSAGE_DELETE
     * - MESSAGE_BULK_DELETE
     * - MEMBER_DISCONNECT
     * - MEMBER_MOVE
     */
    count?: string;
    /**
     * Present from:
     * - CHANNEL_OVERWRITE_CREATE
     * - CHANNEL_OVERWRITE_UPDATE
     * - CHANNEL_OVERWRITE_DELETE
     */
    id?: string;
    /**
     * Present from:
     * - CHANNEL_OVERWRITE_CREATE
     * - CHANNEL_OVERWRITE_UPDATE
     * - CHANNEL_OVERWRITE_DELETE
     */
    type: AuditLogOptionsType;
    /**
     * Present from:
     * - CHANNEL_OVERWRITE_CREATE
     * - CHANNEL_OVERWRITE_UPDATE
     * - CHANNEL_OVERWRITE_DELETE
     *
     * **Present only if the {@link APIAuditLogOptions#type entry type} is "role"**
     */
    role_name?: string;
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum AuditLogOptionsType {
    Member = "member",
    Role = "role"
}
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-change-object-audit-log-change-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChange = APIAuditLogChangeKey$Add | APIAuditLogChangeKey$Remove | APIAuditLogChangeKeyAFKChannelID | APIAuditLogChangeKeyAFKTimeout | APIAuditLogChangeKeyAllow | APIAuditLogChangeKeyAllowNew | APIAuditLogChangeKeyApplicationID | APIAuditLogChangeKeyAvatarHash | APIAuditLogChangeKeyBitrate | APIAuditLogChangeKeyChannelID | APIAuditLogChangeKeyCode | APIAuditLogChangeKeyColor | APIAuditLogChangeKeyDeaf | APIAuditLogChangeKeyDefaultMessageNotifications | APIAuditLogChangeKeyDeny | APIAuditLogChangeKeyDenyNew | APIAuditLogChangeKeyEnableEmoticons | APIAuditLogChangeKeyExpireBehavior | APIAuditLogChangeKeyExpireGracePeriod | APIAuditLogChangeKeyExplicitContentFilter | APIAuditLogChangeKeyHoist | APIAuditLogChangeKeyIconHash | APIAuditLogChangeKeyID | APIAuditLogChangeKeyInviterID | APIAuditLogChangeKeyMaxAge | APIAuditLogChangeKeyMaxUses | APIAuditLogChangeKeyMentionable | APIAuditLogChangeKeyMFALevel | APIAuditLogChangeKeyMute | APIAuditLogChangeKeyName | APIAuditLogChangeKeyNick | APIAuditLogChangeKeyNSFW | APIAuditLogChangeKeyOwnerID | APIAuditLogChangeKeyPermissionOverwrites | APIAuditLogChangeKeyPermissions | APIAuditLogChangeKeyPermissionsNew | APIAuditLogChangeKeyPosition | APIAuditLogChangeKeyPruneDeleteDays | APIAuditLogChangeKeyRateLimitPerUser | APIAuditLogChangeKeyRegion | APIAuditLogChangeKeySplashHash | APIAuditLogChangeKeySystemChannelID | APIAuditLogChangeKeyTemporary | APIAuditLogChangeKeyTopic | APIAuditLogChangeKeyType | APIAuditLogChangeKeyUses | APIAuditLogChangeKeyVanityURLCode | APIAuditLogChangeKeyVerificationLevel | APIAuditLogChangeKeyWidgetChannelID | APIAuditLogChangeKeyWidgetEnabled;
/**
 * Returned when a guild's name is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyName = AuditLogChangeData<'name', string>;
/**
 * Returned when a guild's icon is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyIconHash = AuditLogChangeData<'icon_hash', string>;
/**
 * Returned when a guild's splash is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeySplashHash = AuditLogChangeData<'splash_hash', string>;
/**
 * Returned when a guild's owner ID is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyOwnerID = AuditLogChangeData<'owner_id', string>;
/**
 * Returned when a guild's region is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyRegion = AuditLogChangeData<'region', string>;
/**
 * Returned when a guild's afk_channel_id is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyAFKChannelID = AuditLogChangeData<'afk_channel_id', string>;
/**
 * Returned when a guild's afk_timeout is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyAFKTimeout = AuditLogChangeData<'afk_timeout', number>;
/**
 * Returned when a guild's mfa_level is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyMFALevel = AuditLogChangeData<'mfa_level', GuildMFALevel>;
/**
 * Returned when a guild's verification_level is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyVerificationLevel = AuditLogChangeData<'verification_level', GuildVerificationLevel>;
/**
 * Returned when a guild's explicit_content_filter is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyExplicitContentFilter = AuditLogChangeData<'explicit_content_filter', GuildExplicitContentFilter>;
/**
 * Returned when a guild's default_message_notifications is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyDefaultMessageNotifications = AuditLogChangeData<'default_message_notifications', GuildDefaultMessageNotifications>;
/**
 * Returned when a guild's vanity_url_code is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyVanityURLCode = AuditLogChangeData<'vanity_url_code', string>;
/**
 * Returned when new role(s) are added
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKey$Add = AuditLogChangeData<'$add', APIRole[]>;
/**
 * Returned when role(s) are removed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKey$Remove = AuditLogChangeData<'$remove', APIRole[]>;
/**
 * Returned when there is a change in number of days after which inactive and role-unassigned members are kicked
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyPruneDeleteDays = AuditLogChangeData<'prune_delete_days', number>;
/**
 * Returned when a guild's widget is enabled
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyWidgetEnabled = AuditLogChangeData<'widget_enabled', boolean>;
/**
 * Returned when a guild's widget_channel_id is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyWidgetChannelID = AuditLogChangeData<'widget_channel_id', string>;
/**
 * Returned when a guild's system_channel_id is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeySystemChannelID = AuditLogChangeData<'system_channel_id', string>;
/**
 * Returned when a channel's position is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyPosition = AuditLogChangeData<'position', number>;
/**
 * Returned when a channel's topic is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyTopic = AuditLogChangeData<'topic', string>;
/**
 * Returned when a voice channel's bitrate is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyBitrate = AuditLogChangeData<'bitrate', number>;
/**
 * Returned when a channel's permission overwrites is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyPermissionOverwrites = AuditLogChangeData<'permission_overwrites', APIOverwrite[]>;
/**
 * Returned when a channel's NSFW restriction is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyNSFW = AuditLogChangeData<'nsfw', boolean>;
/**
 * The application ID of the added or removed Webhook or Bot
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyApplicationID = AuditLogChangeData<'application_id', string>;
/**
 * Returned when a channel's amount of seconds a user has to wait before sending another message
 * is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyRateLimitPerUser = AuditLogChangeData<'rate_limit_per_user', number>;
/**
 * Returned when a permission bitfield is changed
 *
 * @deprecated Use `permissions_new` instead
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyPermissions = AuditLogChangeData<'permissions', number>;
/**
 * Returned when a permission bitfield is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyPermissionsNew = AuditLogChangeData<'permissions_new', string>;
/**
 * Returned when a role's color is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyColor = AuditLogChangeData<'color', number>;
/**
 * Returned when a role's hoist status is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyHoist = AuditLogChangeData<'hoist', boolean>;
/**
 * Returned when a role's mentionable status is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyMentionable = AuditLogChangeData<'mentionable', boolean>;
/**
 * Returned when an overwrite's allowed permissions bitfield is changed
 *
 * @deprecated Use `allow_new` instead
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyAllow = AuditLogChangeData<'allow', number>;
/**
 * Returned when an overwrite's allowed permissions bitfield is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyAllowNew = AuditLogChangeData<'allow_new', string>;
/**
 * Returned when an overwrite's denied permissions bitfield is changed
 *
 * @deprecated Use `deny_new` instead
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyDeny = AuditLogChangeData<'deny', number>;
/**
 * Returned when an overwrite's denied permissions bitfield is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyDenyNew = AuditLogChangeData<'deny_new', string>;
/**
 * Returned when an invite's code is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyCode = AuditLogChangeData<'code', string>;
/**
 * Returned when an invite's channel_id is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyChannelID = AuditLogChangeData<'channel_id', string>;
/**
 * Returned when an invite's inviter_id is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyInviterID = AuditLogChangeData<'inviter_id', string>;
/**
 * Returned when an invite's max_uses is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyMaxUses = AuditLogChangeData<'max_uses', number>;
/**
 * Returned when an invite's uses is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyUses = AuditLogChangeData<'uses', number>;
/**
 * Returned when an invite's max_age is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyMaxAge = AuditLogChangeData<'max_age', number>;
/**
 * Returned when an invite's temporary status is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyTemporary = AuditLogChangeData<'temporary', boolean>;
/**
 * Returned when a user's deaf status is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyDeaf = AuditLogChangeData<'deaf', boolean>;
/**
 * Returned when a user's mute status is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyMute = AuditLogChangeData<'mute', boolean>;
/**
 * Returned when a user's nick is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyNick = AuditLogChangeData<'mute', boolean>;
/**
 * Returned when a user's avatar_hash is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyAvatarHash = AuditLogChangeData<'avatar_hash', string>;
/**
 * The ID of the changed entity - sometimes used in conjunction with other keys
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIAuditLogChangeKeyID {
    key: 'id';
    new_value: string;
    old_value?: string;
}
/**
 * The type of entity created
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyType = AuditLogChangeData<'type', ChannelType | string>;
/**
 * Returned when an integration's enable_emoticons is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyEnableEmoticons = AuditLogChangeData<'enable_emoticons', boolean>;
/**
 * Returned when an integration's expire_behavior is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyExpireBehavior = AuditLogChangeData<'expire_behavior', IntegrationExpireBehavior>;
/**
 * Returned when an integration's expire_grace_period is changed
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIAuditLogChangeKeyExpireGracePeriod = AuditLogChangeData<'expire_grace_period', number>;
/**
 * @internal
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
interface AuditLogChangeData<K extends string, D> {
    key: K;
    new_value?: D;
    old_value?: D;
}
export {};
//# sourceMappingURL=auditLog.d.ts.map