/**
 * Types extracted from https://discord.com/developers/docs/resources/audit-log
 */
import type { Snowflake } from '../../globals';
import type { APIAutoModerationAction, APIAutoModerationRule, APIAutoModerationRuleTriggerMetadata, AutoModerationRuleEventType, AutoModerationRuleTriggerType } from './autoModeration';
import type { APIChannel, APIGuildForumDefaultReactionEmoji, APIGuildForumTag, APIOverwrite, VideoQualityMode } from './channel';
import type { APIGuildIntegration, APIGuildIntegrationType, GuildDefaultMessageNotifications, GuildExplicitContentFilter, GuildMFALevel, GuildSystemChannelFlags, GuildVerificationLevel, IntegrationExpireBehavior } from './guild';
import type { APIGuildScheduledEvent, APIGuildScheduledEventRecurrenceRule, GuildScheduledEventEntityType, GuildScheduledEventStatus } from './guildScheduledEvent';
import type { APIApplicationCommand } from './interactions';
import type { APIRole } from './permissions';
import type { StageInstancePrivacyLevel } from './stageInstance';
import type { StickerFormatType } from './sticker';
import type { APIUser } from './user';
import type { APIWebhook } from './webhook';
/**
 * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-object-audit-log-structure}
 */
export interface APIAuditLog {
    /**
     * List of application commands found in the audit log
     *
     * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object}
     */
    application_commands: APIApplicationCommand[];
    /**
     * Webhooks found in the audit log
     *
     * @see {@link https://discord.com/developers/docs/resources/webhook#webhook-object}
     */
    webhooks: APIWebhook[];
    /**
     * Users found in the audit log
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    users: APIUser[];
    /**
     * Audit log entries
     *
     * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object}
     */
    audit_log_entries: APIAuditLogEntry[];
    /**
     * List of auto moderation rules referenced in the audit log
     *
     * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object}
     */
    auto_moderation_rules: APIAutoModerationRule[];
    /**
     * Partial integration objects
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#integration-object}
     */
    integrations: APIGuildIntegration[];
    /**
     * Threads found in the audit log
     *
     * Threads referenced in THREAD_CREATE and THREAD_UPDATE events are included in the threads map, since archived threads might not be kept in memory by clients.
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#channel-object}
     */
    threads: APIChannel[];
    /**
     * The guild scheduled events in the audit log
     *
     * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object}
     */
    guild_scheduled_events: APIGuildScheduledEvent[];
}
/**
 * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-entry-structure}
 */
export interface APIAuditLogEntry {
    /**
     * ID of the affected entity (webhook, user, role, etc.)
     */
    target_id: string | null;
    /**
     * Changes made to the `target_id`
     *
     * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-change-object}
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
     * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-events}
     */
    action_type: AuditLogEvent;
    /**
     * Additional info for certain action types
     *
     * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-optional-audit-entry-info}
     */
    options?: APIAuditLogOptions;
    /**
     * The reason for the change (0-512 characters)
     */
    reason?: string;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-events}
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
    GuildScheduledEventDelete = 102,
    ThreadCreate = 110,
    ThreadUpdate = 111,
    ThreadDelete = 112,
    ApplicationCommandPermissionUpdate = 121,
    SoundboardSoundCreate = 130,
    SoundboardSoundUpdate = 131,
    SoundboardSoundDelete = 132,
    AutoModerationRuleCreate = 140,
    AutoModerationRuleUpdate = 141,
    AutoModerationRuleDelete = 142,
    AutoModerationBlockMessage = 143,
    AutoModerationFlagToChannel = 144,
    AutoModerationUserCommunicationDisabled = 145,
    AutoModerationQuarantineUser = 146,
    CreatorMonetizationRequestCreated = 150,
    CreatorMonetizationTermsAccepted = 151,
    OnboardingPromptCreate = 163,
    OnboardingPromptUpdate = 164,
    OnboardingPromptDelete = 165,
    OnboardingCreate = 166,
    OnboardingUpdate = 167,
    HomeSettingsCreate = 190,
    HomeSettingsUpdate = 191
}
/**
 * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-optional-audit-entry-info}
 */
export interface APIAuditLogOptions {
    /**
     * Name of the Auto Moderation rule that was triggered
     *
     * Present from:
     * - AUTO_MODERATION_BLOCK_MESSAGE
     * - AUTO_MODERATION_FLAG_TO_CHANNEL
     * - AUTO_MODERATION_USER_COMMUNICATION_DISABLED
     * - AUTO_MODERATION_QUARANTINE_USER
     */
    auto_moderation_rule_name?: string;
    /**
     * Trigger type of the Auto Moderation rule that was triggered
     *
     * Present from:
     * - AUTO_MODERATION_BLOCK_MESSAGE
     * - AUTO_MODERATION_FLAG_TO_CHANNEL
     * - AUTO_MODERATION_USER_COMMUNICATION_DISABLED
     * - AUTO_MODERATION_QUARANTINE_USER
     */
    auto_moderation_rule_trigger_type?: AuditLogRuleTriggerType;
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
     * - AUTO_MODERATION_BLOCK_MESSAGE
     * - AUTO_MODERATION_FLAG_TO_CHANNEL
     * - AUTO_MODERATION_USER_COMMUNICATION_DISABLED
     * - AUTO_MODERATION_QUARANTINE_USER
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
     * **Present only if the {@link APIAuditLogOptions."type" | entry type} is "0"**
     */
    role_name?: string;
    /**
     * Type of integration which performed the action
     *
     * Present from:
     * - MEMBER_KICK
     * - MEMBER_ROLE_UPDATE
     */
    integration_type?: APIGuildIntegrationType;
}
export declare enum AuditLogOptionsType {
    Role = "0",
    Member = "1"
}
export type AuditLogRuleTriggerType = `${AutoModerationRuleTriggerType}`;
/**
 * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-change-object-audit-log-change-structure}
 */
export type APIAuditLogChange = APIAuditLogChangeKey$Add | APIAuditLogChangeKey$Remove | APIAuditLogChangeKeyActions | APIAuditLogChangeKeyAFKChannelId | APIAuditLogChangeKeyAFKTimeout | APIAuditLogChangeKeyAllow | APIAuditLogChangeKeyApplicationId | APIAuditLogChangeKeyArchived | APIAuditLogChangeKeyAsset | APIAuditLogChangeKeyAutoArchiveDuration | APIAuditLogChangeKeyAvailable | APIAuditLogChangeKeyAvailableTags | APIAuditLogChangeKeyAvatarHash | APIAuditLogChangeKeyBannerHash | APIAuditLogChangeKeyBitrate | APIAuditLogChangeKeyChannelId | APIAuditLogChangeKeyCode | APIAuditLogChangeKeyColor | APIAuditLogChangeKeyCommunicationDisabledUntil | APIAuditLogChangeKeyDeaf | APIAuditLogChangeKeyDefaultAutoArchiveDuration | APIAuditLogChangeKeyDefaultMessageNotifications | APIAuditLogChangeKeyDefaultReactionEmoji | APIAuditLogChangeKeyDefaultThreadRateLimitPerUser | APIAuditLogChangeKeyDeny | APIAuditLogChangeKeyDescription | APIAuditLogChangeKeyDiscoverySplashHash | APIAuditLogChangeKeyEmojiId | APIAuditLogChangeKeyEmojiName | APIAuditLogChangeKeyEnabled | APIAuditLogChangeKeyEnableEmoticons | APIAuditLogChangeKeyEntityType | APIAuditLogChangeKeyEventType | APIAuditLogChangeKeyExemptChannels | APIAuditLogChangeKeyExemptRoles | APIAuditLogChangeKeyExpireBehavior | APIAuditLogChangeKeyExpireGracePeriod | APIAuditLogChangeKeyExplicitContentFilter | APIAuditLogChangeKeyFlags | APIAuditLogChangeKeyFormatType | APIAuditLogChangeKeyGuildId | APIAuditLogChangeKeyHoist | APIAuditLogChangeKeyIconHash | APIAuditLogChangeKeyId | APIAuditLogChangeKeyImageHash | APIAuditLogChangeKeyInviterId | APIAuditLogChangeKeyLocation | APIAuditLogChangeKeyLocked | APIAuditLogChangeKeyMaxAge | APIAuditLogChangeKeyMaxUses | APIAuditLogChangeKeyMentionable | APIAuditLogChangeKeyMFALevel | APIAuditLogChangeKeyMute | APIAuditLogChangeKeyName | APIAuditLogChangeKeyNick | APIAuditLogChangeKeyNSFW | APIAuditLogChangeKeyOwnerId | APIAuditLogChangeKeyPermissionOverwrites | APIAuditLogChangeKeyPermissions | APIAuditLogChangeKeyPosition | APIAuditLogChangeKeyPreferredLocale | APIAuditLogChangeKeyPremiumProgressBarEnabled | APIAuditLogChangeKeyPrivacyLevel | APIAuditLogChangeKeyPruneDeleteDays | APIAuditLogChangeKeyPublicUpdatesChannelId | APIAuditLogChangeKeyRateLimitPerUser | APIAuditLogChangeKeyRecurrenceRule | APIAuditLogChangeKeyRegion | APIAuditLogChangeKeyRTCRegion | APIAuditLogChangeKeyRulesChannelId | APIAuditLogChangeKeySafetyAlertsChannelId | APIAuditLogChangeKeySoundId | APIAuditLogChangeKeySplashHash | APIAuditLogChangeKeyStatus | APIAuditLogChangeKeySystemChannelFlags | APIAuditLogChangeKeySystemChannelId | APIAuditLogChangeKeyTags | APIAuditLogChangeKeyTemporary | APIAuditLogChangeKeyTopic | APIAuditLogChangeKeyTriggerMetadata | APIAuditLogChangeKeyTriggerType | APIAuditLogChangeKeyType | APIAuditLogChangeKeyUserId | APIAuditLogChangeKeyUserLimit | APIAuditLogChangeKeyUses | APIAuditLogChangeKeyVanityURLCode | APIAuditLogChangeKeyVerificationLevel | APIAuditLogChangeKeyVideoQualityMode | APIAuditLogChangeKeyVolume | APIAuditLogChangeKeyWidgetChannelId | APIAuditLogChangeKeyWidgetEnabled;
/**
 * Returned when an entity's name is changed
 */
export type APIAuditLogChangeKeyName = APIAuditLogChangeData<'name', string>;
/**
 * Returned when a guild's or sticker's or guild scheduled event's description is changed
 */
export type APIAuditLogChangeKeyDescription = APIAuditLogChangeData<'description', string>;
/**
 * Returned when a guild's icon is changed
 */
export type APIAuditLogChangeKeyIconHash = APIAuditLogChangeData<'icon_hash', string>;
/**
 * Returned when a guild's scheduled event's cover image is changed
 */
export type APIAuditLogChangeKeyImageHash = APIAuditLogChangeData<'image_hash', string>;
/**
 * Returned when a guild's splash is changed
 */
export type APIAuditLogChangeKeySplashHash = APIAuditLogChangeData<'splash_hash', string>;
/**
 * Returned when a guild's discovery splash is changed
 */
export type APIAuditLogChangeKeyDiscoverySplashHash = APIAuditLogChangeData<'discovery_splash_hash', string>;
/**
 * Returned when a guild's banner hash is changed
 */
export type APIAuditLogChangeKeyBannerHash = APIAuditLogChangeData<'banner_hash', string>;
/**
 * Returned when a guild's owner_id is changed
 */
export type APIAuditLogChangeKeyOwnerId = APIAuditLogChangeData<'owner_id', Snowflake>;
/**
 * Returned when a guild's region is changed
 */
export type APIAuditLogChangeKeyRegion = APIAuditLogChangeData<'region', string>;
/**
 * Returned when a channel's rtc_region is changed
 */
export type APIAuditLogChangeKeyRTCRegion = APIAuditLogChangeData<'rtc_region', string>;
/**
 * Returned when a guild's preferred_locale is changed
 */
export type APIAuditLogChangeKeyPreferredLocale = APIAuditLogChangeData<'preferred_locale', string>;
/**
 * Returned when a guild's afk_channel_id is changed
 */
export type APIAuditLogChangeKeyAFKChannelId = APIAuditLogChangeData<'afk_channel_id', Snowflake>;
/**
 * Returned when a guild's afk_timeout is changed
 */
export type APIAuditLogChangeKeyAFKTimeout = APIAuditLogChangeData<'afk_timeout', number>;
/**
 * Returned when a guild's rules_channel_id is changed
 */
export type APIAuditLogChangeKeyRulesChannelId = APIAuditLogChangeData<'rules_channel_id', string>;
/**
 * Returned when a guild's public_updates_channel_id is changed
 */
export type APIAuditLogChangeKeyPublicUpdatesChannelId = APIAuditLogChangeData<'public_updates_channel_id', string>;
/**
 * Returned when a guild's safety_alerts_channel_id is changed
 */
export type APIAuditLogChangeKeySafetyAlertsChannelId = APIAuditLogChangeData<'safety_alerts_channel_id', string>;
/**
 * Returned when a guild's mfa_level is changed
 */
export type APIAuditLogChangeKeyMFALevel = APIAuditLogChangeData<'mfa_level', GuildMFALevel>;
/**
 * Returned when a guild's verification_level is changed
 */
export type APIAuditLogChangeKeyVerificationLevel = APIAuditLogChangeData<'verification_level', GuildVerificationLevel>;
/**
 * Returned when a channel's video_quality_mode is changed
 */
export type APIAuditLogChangeKeyVideoQualityMode = APIAuditLogChangeData<'video_quality_mode', VideoQualityMode>;
/**
 * Returned when a guild's explicit_content_filter is changed
 */
export type APIAuditLogChangeKeyExplicitContentFilter = APIAuditLogChangeData<'explicit_content_filter', GuildExplicitContentFilter>;
/**
 * Returned when a guild's default_message_notifications is changed
 */
export type APIAuditLogChangeKeyDefaultMessageNotifications = APIAuditLogChangeData<'default_message_notifications', GuildDefaultMessageNotifications>;
/**
 * Returned when a guild's vanity_url_code is changed
 */
export type APIAuditLogChangeKeyVanityURLCode = APIAuditLogChangeData<'vanity_url_code', string>;
/**
 * Returned when a guild's boost progress bar is enabled
 */
export type APIAuditLogChangeKeyPremiumProgressBarEnabled = APIAuditLogChangeData<'premium_progress_bar_enabled', boolean>;
/**
 * Returned when new role(s) are added
 */
export type APIAuditLogChangeKey$Add = APIAuditLogChangeData<'$add', Pick<APIRole, 'id' | 'name'>[]>;
/**
 * Returned when role(s) are removed
 */
export type APIAuditLogChangeKey$Remove = APIAuditLogChangeData<'$remove', Pick<APIRole, 'id' | 'name'>[]>;
/**
 * Returned when there is a change in number of days after which inactive and role-unassigned members are kicked
 */
export type APIAuditLogChangeKeyPruneDeleteDays = APIAuditLogChangeData<'prune_delete_days', number>;
/**
 * Returned when a guild's widget is enabled
 */
export type APIAuditLogChangeKeyWidgetEnabled = APIAuditLogChangeData<'widget_enabled', boolean>;
/**
 * Returned when a guild's widget_channel_id is changed
 */
export type APIAuditLogChangeKeyWidgetChannelId = APIAuditLogChangeData<'widget_channel_id', Snowflake>;
/**
 * Returned when a guild's system_channel_flags is changed
 */
export type APIAuditLogChangeKeySystemChannelFlags = APIAuditLogChangeData<'system_channel_flags', GuildSystemChannelFlags>;
/**
 * Returned when a guild's system_channel_id is changed
 */
export type APIAuditLogChangeKeySystemChannelId = APIAuditLogChangeData<'system_channel_id', Snowflake>;
/**
 * Returned when a channel's position is changed
 */
export type APIAuditLogChangeKeyPosition = APIAuditLogChangeData<'position', number>;
/**
 * Returned when a channel's topic is changed
 */
export type APIAuditLogChangeKeyTopic = APIAuditLogChangeData<'topic', string>;
/**
 * Returned when a voice channel's bitrate is changed
 */
export type APIAuditLogChangeKeyBitrate = APIAuditLogChangeData<'bitrate', number>;
/**
 * Returned when a channel's permission overwrites is changed
 */
export type APIAuditLogChangeKeyPermissionOverwrites = APIAuditLogChangeData<'permission_overwrites', APIOverwrite[]>;
/**
 * Returned when a channel's NSFW restriction is changed
 */
export type APIAuditLogChangeKeyNSFW = APIAuditLogChangeData<'nsfw', boolean>;
/**
 * The application ID of the added or removed Webhook or Bot
 */
export type APIAuditLogChangeKeyApplicationId = APIAuditLogChangeData<'application_id', Snowflake>;
/**
 * Returned when a channel's amount of seconds a user has to wait before sending another message
 * is changed
 */
export type APIAuditLogChangeKeyRateLimitPerUser = APIAuditLogChangeData<'rate_limit_per_user', number>;
/**
 * Returned when a guild scheduled event's recurrence_rule is changed
 */
export type APIAuditLogChangeKeyRecurrenceRule = APIAuditLogChangeData<'recurrence_rule', APIGuildScheduledEventRecurrenceRule>;
/**
 * Returned when a permission bitfield is changed
 */
export type APIAuditLogChangeKeyPermissions = APIAuditLogChangeData<'permissions', string>;
/**
 * Returned when a role's color is changed
 */
export type APIAuditLogChangeKeyColor = APIAuditLogChangeData<'color', number>;
/**
 * Represents a change where the key is a snowflake.
 * Currently, the only known instance of this is returned when permissions for a command were updated
 */
export type APIAuditLogChangeKeySnowflake = APIAuditLogChangeData<Snowflake, unknown>;
/**
 * Returned when a role's hoist status is changed
 */
export type APIAuditLogChangeKeyHoist = APIAuditLogChangeData<'hoist', boolean>;
/**
 * Returned when a role's mentionable status is changed
 */
export type APIAuditLogChangeKeyMentionable = APIAuditLogChangeData<'mentionable', boolean>;
/**
 * Returned when an overwrite's allowed permissions bitfield is changed
 */
export type APIAuditLogChangeKeyAllow = APIAuditLogChangeData<'allow', string>;
/**
 * Returned when an overwrite's denied permissions bitfield is changed
 */
export type APIAuditLogChangeKeyDeny = APIAuditLogChangeData<'deny', string>;
/**
 * Returned when an invite's code is changed
 */
export type APIAuditLogChangeKeyCode = APIAuditLogChangeData<'code', string>;
/**
 * Returned when an invite's or guild scheduled event's channel_id is changed
 */
export type APIAuditLogChangeKeyChannelId = APIAuditLogChangeData<'channel_id', Snowflake>;
/**
 * Returned when an invite's inviter_id is changed
 */
export type APIAuditLogChangeKeyInviterId = APIAuditLogChangeData<'inviter_id', Snowflake>;
/**
 * Returned when an invite's max_uses is changed
 */
export type APIAuditLogChangeKeyMaxUses = APIAuditLogChangeData<'max_uses', number>;
/**
 * Returned when an invite's uses is changed
 */
export type APIAuditLogChangeKeyUses = APIAuditLogChangeData<'uses', number>;
/**
 * Returned when an invite's max_age is changed
 */
export type APIAuditLogChangeKeyMaxAge = APIAuditLogChangeData<'max_age', number>;
/**
 * Returned when an invite's temporary status is changed
 */
export type APIAuditLogChangeKeyTemporary = APIAuditLogChangeData<'temporary', boolean>;
/**
 * Returned when a user's deaf status is changed
 */
export type APIAuditLogChangeKeyDeaf = APIAuditLogChangeData<'deaf', boolean>;
/**
 * Returned when a user's mute status is changed
 */
export type APIAuditLogChangeKeyMute = APIAuditLogChangeData<'mute', boolean>;
/**
 * Returned when a user's nick is changed
 */
export type APIAuditLogChangeKeyNick = APIAuditLogChangeData<'nick', string>;
/**
 * Returned when a user's avatar_hash is changed
 */
export type APIAuditLogChangeKeyAvatarHash = APIAuditLogChangeData<'avatar_hash', string>;
/**
 * The ID of the changed entity - sometimes used in conjunction with other keys
 */
export type APIAuditLogChangeKeyId = APIAuditLogChangeData<'id', Snowflake>;
/**
 * The type of entity created
 */
export type APIAuditLogChangeKeyType = APIAuditLogChangeData<'type', number | string>;
/**
 * Returned when an integration's enable_emoticons is changed
 */
export type APIAuditLogChangeKeyEnableEmoticons = APIAuditLogChangeData<'enable_emoticons', boolean>;
/**
 * Returned when an integration's expire_behavior is changed
 */
export type APIAuditLogChangeKeyExpireBehavior = APIAuditLogChangeData<'expire_behavior', IntegrationExpireBehavior>;
/**
 * Returned when an integration's expire_grace_period is changed
 */
export type APIAuditLogChangeKeyExpireGracePeriod = APIAuditLogChangeData<'expire_grace_period', number>;
/**
 * Returned when a voice channel's user_limit is changed
 */
export type APIAuditLogChangeKeyUserLimit = APIAuditLogChangeData<'user_limit', number>;
/**
 * Returned when privacy level of a stage instance or guild scheduled event is changed
 */
export type APIAuditLogChangeKeyPrivacyLevel = APIAuditLogChangeData<'privacy_level', StageInstancePrivacyLevel>;
/**
 * Returned when a sticker's related emoji is changed
 */
export type APIAuditLogChangeKeyTags = APIAuditLogChangeData<'tags', string>;
/**
 * Returned when a sticker's format_type is changed
 */
export type APIAuditLogChangeKeyFormatType = APIAuditLogChangeData<'format_type', StickerFormatType>;
/**
 * Empty string
 */
export type APIAuditLogChangeKeyAsset = APIAuditLogChangeData<'asset', ''>;
/**
 * Returned when a sticker's availability is changed
 */
export type APIAuditLogChangeKeyAvailable = APIAuditLogChangeData<'available', boolean>;
/**
 * Returned when a sticker's guild_id is changed
 */
export type APIAuditLogChangeKeyGuildId = APIAuditLogChangeData<'guild_id', Snowflake>;
/**
 * Returned when a thread's archive status is changed
 */
export type APIAuditLogChangeKeyArchived = APIAuditLogChangeData<'archived', boolean>;
/**
 * Returned when a thread's lock status is changed
 */
export type APIAuditLogChangeKeyLocked = APIAuditLogChangeData<'locked', boolean>;
/**
 * Returned when a thread's auto archive duration is changed
 */
export type APIAuditLogChangeKeyAutoArchiveDuration = APIAuditLogChangeData<'auto_archive_duration', number>;
/**
 * Returned when a channel's default auto archive duration for newly created threads is changed
 */
export type APIAuditLogChangeKeyDefaultAutoArchiveDuration = APIAuditLogChangeData<'default_auto_archive_duration', number>;
/**
 * Returned when entity type of a guild scheduled event is changed
 */
export type APIAuditLogChangeKeyEntityType = APIAuditLogChangeData<'entity_type', GuildScheduledEventEntityType>;
/**
 * Returned when status of a guild scheduled event is changed
 */
export type APIAuditLogChangeKeyStatus = APIAuditLogChangeData<'status', GuildScheduledEventStatus>;
/**
 * Returned when location of a guild scheduled event is changed
 */
export type APIAuditLogChangeKeyLocation = APIAuditLogChangeData<'location', string>;
/**
 * Returned when a user's timeout is changed
 */
export type APIAuditLogChangeKeyCommunicationDisabledUntil = APIAuditLogChangeData<'communication_disabled_until', string>;
/**
 * Returned when an auto moderation rule's trigger type is changed (only in rule creation or deletion)
 */
export type APIAuditLogChangeKeyTriggerType = APIAuditLogChangeData<'trigger_type', AutoModerationRuleTriggerType>;
/**
 * Returned when an auto moderation rule's event type is changed
 */
export type APIAuditLogChangeKeyEventType = APIAuditLogChangeData<'event_type', AutoModerationRuleEventType>;
/**
 * Returned when an auto moderation rule's trigger metadata is changed
 */
export type APIAuditLogChangeKeyTriggerMetadata = APIAuditLogChangeData<'trigger_metadata', APIAutoModerationRuleTriggerMetadata>;
/**
 * Returned when an auto moderation rule's actions is changed
 */
export type APIAuditLogChangeKeyActions = APIAuditLogChangeData<'actions', APIAutoModerationAction[]>;
/**
 * Returned when an auto moderation rule's enabled status is changed
 */
export type APIAuditLogChangeKeyEnabled = APIAuditLogChangeData<'enabled', boolean>;
/**
 * Returned when an auto moderation rule's exempt roles is changed
 */
export type APIAuditLogChangeKeyExemptRoles = APIAuditLogChangeData<'exempt_roles', Snowflake[]>;
/**
 * Returned when an auto moderation rule's exempt channels is changed
 */
export type APIAuditLogChangeKeyExemptChannels = APIAuditLogChangeData<'exempt_channels', Snowflake[]>;
/**
 * Returned when a guild forum's available tags gets changed
 */
export type APIAuditLogChangeKeyAvailableTags = APIAuditLogChangeData<'available_tags', APIGuildForumTag[]>;
/**
 * Returned when a guild forum's default reaction emoji gets changed
 */
export type APIAuditLogChangeKeyDefaultReactionEmoji = APIAuditLogChangeData<'default_reaction_emoji', APIGuildForumDefaultReactionEmoji>;
/**
 * Returned when a channel flag gets changed
 */
export type APIAuditLogChangeKeyFlags = APIAuditLogChangeData<'flags', number>;
/**
 * Returned when a thread's amount of seconds a user has to wait before creating another thread
 * gets changed
 */
export type APIAuditLogChangeKeyDefaultThreadRateLimitPerUser = APIAuditLogChangeData<'default_thread_rate_limit_per_user', number>;
/**
 * Returned when a soundboard is create or deleted
 */
export type APIAuditLogChangeKeySoundId = APIAuditLogChangeData<'sound_id', Snowflake>;
/**
 * Returned when a soundboard's volume is changed
 */
export type APIAuditLogChangeKeyVolume = APIAuditLogChangeData<'volume', number>;
/**
 * Returned when a soundboard's custom emoji is changed
 */
export type APIAuditLogChangeKeyEmojiId = APIAuditLogChangeData<'emoji_id', Snowflake>;
/**
 * Returned when a soundboard's unicode emoji is changed
 */
export type APIAuditLogChangeKeyEmojiName = APIAuditLogChangeData<'emoji_name', string>;
/**
 * Returned when a sounboard is created
 */
export type APIAuditLogChangeKeyUserId = APIAuditLogChangeData<'user_id', Snowflake>;
export interface APIAuditLogChangeData<K extends string, D> {
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
//# sourceMappingURL=auditLog.d.ts.map