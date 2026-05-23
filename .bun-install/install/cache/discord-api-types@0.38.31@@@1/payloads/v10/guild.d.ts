/**
 * Types extracted from https://discord.com/developers/docs/resources/guild
 */
import type { Permissions, Snowflake } from '../../globals';
import type { Locale } from '../../rest/common';
import type { APIEmoji, APIPartialEmoji } from './emoji';
import type { PresenceUpdateReceiveStatus } from './gateway';
import type { OAuth2Scopes } from './oauth2';
import type { APIRole } from './permissions';
import type { APISticker } from './sticker';
import type { APIAvatarDecorationData, APIUser } from './user';
export interface APIBaseGuild {
    /**
     * Guild id
     */
    id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#unavailable-guild-object}
 */
export interface APIUnavailableGuild extends APIBaseGuild {
    /**
     * `true` if this guild is unavailable due to an outage
     */
    unavailable: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-structure}
 */
export interface APIPartialGuild extends APIBaseGuild {
    /**
     * Guild name (2-100 characters, excluding trailing and leading whitespace)
     */
    name: string;
    /**
     * Icon hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    icon: string | null;
    /**
     * Splash hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    splash: string | null;
    /**
     * Banner hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    banner?: string | null;
    /**
     * The description for the guild
     */
    description?: string | null;
    /**
     * Enabled guild features
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-features}
     */
    features?: GuildFeature[];
    /**
     * Verification level required for the guild
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-verification-level}
     */
    verification_level?: GuildVerificationLevel;
    /**
     * The vanity url code for the guild
     */
    vanity_url_code?: string | null;
    /**
     * The welcome screen of a Community guild, shown to new members
     *
     * Returned in the invite object
     */
    welcome_screen?: APIGuildWelcomeScreen;
}
/**
 * Source guild of channel follower webhooks.
 */
export type APIWebhookSourceGuild = Pick<APIPartialGuild, 'icon' | 'id' | 'name'>;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-structure}
 */
export interface APIGuild extends APIPartialGuild {
    /**
     * Icon hash, returned when in the template object
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    icon_hash?: string | null;
    /**
     * Discovery splash hash; only present for guilds with the "DISCOVERABLE" feature
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    discovery_splash: string | null;
    /**
     * `true` if the user is the owner of the guild
     *
     * **This field is only received from https://discord.com/developers/docs/resources/user#get-current-user-guilds**
     */
    owner?: boolean;
    /**
     * ID of owner
     */
    owner_id: Snowflake;
    /**
     * Total permissions for the user in the guild (excludes overrides)
     *
     * **This field is only received from https://discord.com/developers/docs/resources/user#get-current-user-guilds**
     *
     * @see {@link https://en.wikipedia.org/wiki/Bit_field}
     */
    permissions?: Permissions;
    /**
     * Voice region id for the guild
     *
     * @see {@link https://discord.com/developers/docs/resources/voice#voice-region-object}
     * @deprecated This field has been deprecated in favor of `rtc_region` on the channel.
     */
    region: string;
    /**
     * ID of afk channel
     */
    afk_channel_id: Snowflake | null;
    /**
     * afk timeout in seconds, can be set to: `60`, `300`, `900`, `1800`, `3600`
     */
    afk_timeout: 1800 | 3600 | 60 | 300 | 900;
    /**
     * `true` if the guild widget is enabled
     */
    widget_enabled?: boolean;
    /**
     * The channel id that the widget will generate an invite to, or `null` if set to no invite
     */
    widget_channel_id?: Snowflake | null;
    /**
     * Verification level required for the guild
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-verification-level}
     */
    verification_level: GuildVerificationLevel;
    /**
     * Default message notifications level
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-default-message-notification-level}
     */
    default_message_notifications: GuildDefaultMessageNotifications;
    /**
     * Explicit content filter level
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-explicit-content-filter-level}
     */
    explicit_content_filter: GuildExplicitContentFilter;
    /**
     * Roles in the guild
     *
     * @see {@link https://discord.com/developers/docs/topics/permissions#role-object}
     */
    roles: APIRole[];
    /**
     * Custom guild emojis
     *
     * @see {@link https://discord.com/developers/docs/resources/emoji#emoji-object}
     */
    emojis: APIEmoji[];
    /**
     * Enabled guild features
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-features}
     */
    features: GuildFeature[];
    /**
     * Required MFA level for the guild
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-mfa-level}
     */
    mfa_level: GuildMFALevel;
    /**
     * Application id of the guild creator if it is bot-created
     */
    application_id: Snowflake | null;
    /**
     * The id of the channel where guild notices such as welcome messages and boost events are posted
     */
    system_channel_id: Snowflake | null;
    /**
     * System channel flags
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-system-channel-flags}
     */
    system_channel_flags: GuildSystemChannelFlags;
    /**
     * The id of the channel where Community guilds can display rules and/or guidelines
     */
    rules_channel_id: Snowflake | null;
    /**
     * The maximum number of presences for the guild (`null` is always returned, apart from the largest of guilds)
     */
    max_presences?: number | null;
    /**
     * The maximum number of members for the guild
     */
    max_members?: number;
    /**
     * The vanity url code for the guild
     */
    vanity_url_code: string | null;
    /**
     * The description for the guild
     */
    description: string | null;
    /**
     * Banner hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    banner: string | null;
    /**
     * Premium tier (Server Boost level)
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-premium-tier}
     */
    premium_tier: GuildPremiumTier;
    /**
     * The number of boosts this guild currently has
     */
    premium_subscription_count?: number;
    /**
     * The preferred locale of a Community guild; used in guild discovery and notices from Discord
     *
     * @defaultValue `"en-US"`
     */
    preferred_locale: Locale;
    /**
     * The id of the channel where admins and moderators of Community guilds receive notices from Discord
     */
    public_updates_channel_id: Snowflake | null;
    /**
     * The maximum amount of users in a video channel
     */
    max_video_channel_users?: number;
    /**
     * The maximum amount of users in a stage video channel
     */
    max_stage_video_channel_users?: number;
    /**
     * Approximate number of members in this guild,
     * returned from the `GET /guilds/<id>` and `/users/@me/guilds` (OAuth2) endpoints when `with_counts` is `true`
     */
    approximate_member_count?: number;
    /**
     * Approximate number of non-offline members in this guild,
     * returned from the `GET /guilds/<id>` and `/users/@me/guilds` (OAuth2) endpoints when `with_counts` is `true`
     */
    approximate_presence_count?: number;
    /**
     * The nsfw level of the guild
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-nsfw-level}
     */
    nsfw_level: GuildNSFWLevel;
    /**
     * Custom guild stickers
     *
     * @see {@link https://discord.com/developers/docs/resources/sticker#sticker-object}
     */
    stickers: APISticker[];
    /**
     * Whether the guild has the boost progress bar enabled.
     */
    premium_progress_bar_enabled: boolean;
    /**
     * The type of Student Hub the guild is
     */
    hub_type: GuildHubType | null;
    /**
     * The id of the channel where admins and moderators of Community guilds receive safety alerts from Discord
     */
    safety_alerts_channel_id: Snowflake | null;
    /**
     * The incidents data for this guild
     */
    incidents_data: APIIncidentsData | null;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-structure}
 */
export interface APIPartialInteractionGuild extends Pick<APIGuild, 'features' | 'id'> {
    /**
     * The preferred locale of a Community guild; used in guild discovery and notices from Discord
     *
     * @unstable https://github.com/discord/discord-api-docs/issues/6938
     * @defaultValue `"en-US"`
     */
    locale: Locale;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-default-message-notification-level}
 */
export declare enum GuildDefaultMessageNotifications {
    AllMessages = 0,
    OnlyMentions = 1
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-explicit-content-filter-level}
 */
export declare enum GuildExplicitContentFilter {
    Disabled = 0,
    MembersWithoutRoles = 1,
    AllMembers = 2
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-mfa-level}
 */
export declare enum GuildMFALevel {
    None = 0,
    Elevated = 1
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-nsfw-level}
 */
export declare enum GuildNSFWLevel {
    Default = 0,
    Explicit = 1,
    Safe = 2,
    AgeRestricted = 3
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-verification-level}
 */
export declare enum GuildVerificationLevel {
    /**
     * Unrestricted
     */
    None = 0,
    /**
     * Must have verified email on account
     */
    Low = 1,
    /**
     * Must be registered on Discord for longer than 5 minutes
     */
    Medium = 2,
    /**
     * Must be a member of the guild for longer than 10 minutes
     */
    High = 3,
    /**
     * Must have a verified phone number
     */
    VeryHigh = 4
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-premium-tier}
 */
export declare enum GuildPremiumTier {
    None = 0,
    Tier1 = 1,
    Tier2 = 2,
    Tier3 = 3
}
export declare enum GuildHubType {
    Default = 0,
    HighSchool = 1,
    College = 2
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-system-channel-flags}
 */
export declare enum GuildSystemChannelFlags {
    /**
     * Suppress member join notifications
     */
    SuppressJoinNotifications = 1,
    /**
     * Suppress server boost notifications
     */
    SuppressPremiumSubscriptions = 2,
    /**
     * Suppress server setup tips
     */
    SuppressGuildReminderNotifications = 4,
    /**
     * Hide member join sticker reply buttons
     */
    SuppressJoinNotificationReplies = 8,
    /**
     * Suppress role subscription purchase and renewal notifications
     */
    SuppressRoleSubscriptionPurchaseNotifications = 16,
    /**
     * Hide role subscription sticker reply buttons
     */
    SuppressRoleSubscriptionPurchaseNotificationReplies = 32
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-features}
 */
export declare enum GuildFeature {
    /**
     * Guild has access to set an animated guild banner image
     */
    AnimatedBanner = "ANIMATED_BANNER",
    /**
     * Guild has access to set an animated guild icon
     */
    AnimatedIcon = "ANIMATED_ICON",
    /**
     * Guild is using the old permissions configuration behavior
     *
     * @see {@link https://discord.com/developers/docs/change-log#upcoming-application-command-permission-changes}
     */
    ApplicationCommandPermissionsV2 = "APPLICATION_COMMAND_PERMISSIONS_V2",
    /**
     * Guild has set up auto moderation rules
     */
    AutoModeration = "AUTO_MODERATION",
    /**
     * Guild has access to set a guild banner image
     */
    Banner = "BANNER",
    /**
     * Guild can enable welcome screen, Membership Screening and discovery, and receives community updates
     */
    Community = "COMMUNITY",
    /**
     * Guild has enabled monetization
     */
    CreatorMonetizableProvisional = "CREATOR_MONETIZABLE_PROVISIONAL",
    /**
     * Guild has enabled the role subscription promo page
     */
    CreatorStorePage = "CREATOR_STORE_PAGE",
    /**
     * Guild has been set as a support server on the App Directory
     */
    DeveloperSupportServer = "DEVELOPER_SUPPORT_SERVER",
    /**
     * Guild is able to be discovered in the directory
     */
    Discoverable = "DISCOVERABLE",
    /**
     * Guild is able to be featured in the directory
     */
    Featurable = "FEATURABLE",
    /**
     * Guild is listed in a directory channel
     */
    HasDirectoryEntry = "HAS_DIRECTORY_ENTRY",
    /**
     * Guild is a Student Hub
     *
     * @see {@link https://support.discord.com/hc/articles/4406046651927}
     * @unstable This feature is currently not documented by Discord, but has known value
     */
    Hub = "HUB",
    /**
     * Guild has disabled invite usage, preventing users from joining
     */
    InvitesDisabled = "INVITES_DISABLED",
    /**
     * Guild has access to set an invite splash background
     */
    InviteSplash = "INVITE_SPLASH",
    /**
     * Guild is in a Student Hub
     *
     * @see {@link https://support.discord.com/hc/articles/4406046651927}
     * @unstable This feature is currently not documented by Discord, but has known value
     */
    LinkedToHub = "LINKED_TO_HUB",
    /**
     * Guild has enabled Membership Screening
     */
    MemberVerificationGateEnabled = "MEMBER_VERIFICATION_GATE_ENABLED",
    /**
     * Guild has increased custom soundboard sound slots
     */
    MoreSoundboard = "MORE_SOUNDBOARD",
    /**
     * Guild has enabled monetization
     *
     * @unstable This feature is no longer documented by Discord
     */
    MonetizationEnabled = "MONETIZATION_ENABLED",
    /**
     * Guild has increased custom sticker slots
     */
    MoreStickers = "MORE_STICKERS",
    /**
     * Guild has access to create news channels
     */
    News = "NEWS",
    /**
     * Guild is partnered
     */
    Partnered = "PARTNERED",
    /**
     * Guild can be previewed before joining via Membership Screening or the directory
     */
    PreviewEnabled = "PREVIEW_ENABLED",
    /**
     * Guild has access to create private threads
     */
    PrivateThreads = "PRIVATE_THREADS",
    /**
     * Guild has disabled alerts for join raids in the configured safety alerts channel
     */
    RaidAlertsDisabled = "RAID_ALERTS_DISABLED",
    RelayEnabled = "RELAY_ENABLED",
    /**
     * Guild is able to set role icons
     */
    RoleIcons = "ROLE_ICONS",
    /**
     * Guild has role subscriptions that can be purchased
     */
    RoleSubscriptionsAvailableForPurchase = "ROLE_SUBSCRIPTIONS_AVAILABLE_FOR_PURCHASE",
    /**
     * Guild has enabled role subscriptions
     */
    RoleSubscriptionsEnabled = "ROLE_SUBSCRIPTIONS_ENABLED",
    /**
     * Guild has created soundboard sounds
     */
    Soundboard = "SOUNDBOARD",
    /**
     * Guild has enabled ticketed events
     */
    TicketedEventsEnabled = "TICKETED_EVENTS_ENABLED",
    /**
     * Guild has access to set a vanity URL
     */
    VanityURL = "VANITY_URL",
    /**
     * Guild is verified
     */
    Verified = "VERIFIED",
    /**
     * Guild has access to set 384kbps bitrate in voice (previously VIP voice servers)
     */
    VIPRegions = "VIP_REGIONS",
    /**
     * Guild has enabled the welcome screen
     */
    WelcomeScreenEnabled = "WELCOME_SCREEN_ENABLED",
    /**
     * Guild has access to set guild tags
     */
    GuildTags = "GUILD_TAGS",
    /**
     * Guild is able to set gradient colors to roles
     */
    EnhancedRoleColors = "ENHANCED_ROLE_COLORS",
    /**
     * Guild has access to guest invites
     */
    GuestsEnabled = "GUESTS_ENABLED",
    /**
     * Guild has migrated to the new pin messages permission
     *
     * @unstable This feature is currently not documented by Discord, but has known value
     */
    PinPermissionMigrationComplete = "PIN_PERMISSION_MIGRATION_COMPLETE"
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-preview-object}
 */
export interface APIGuildPreview {
    /**
     * Guild id
     */
    id: Snowflake;
    /**
     * Guild name (2-100 characters)
     */
    name: string;
    /**
     * Icon hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    icon: string | null;
    /**
     * Splash hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    splash: string | null;
    /**
     * Discovery splash hash; only present for guilds with the "DISCOVERABLE" feature
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    discovery_splash: string | null;
    /**
     * Custom guild emojis
     *
     * @see {@link https://discord.com/developers/docs/resources/emoji#emoji-object}
     */
    emojis: APIEmoji[];
    /**
     * Enabled guild features
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-features}
     */
    features: GuildFeature[];
    /**
     * Approximate number of members in this guild
     */
    approximate_member_count: number;
    /**
     * Approximate number of online members in this guild
     */
    approximate_presence_count: number;
    /**
     * The description for the guild
     */
    description: string;
    /**
     * Custom guild stickers
     */
    stickers: APISticker[];
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-widget-object}
 */
export interface APIGuildWidgetSettings {
    /**
     * Whether the widget is enabled
     */
    enabled: boolean;
    /**
     * The widget channel id
     */
    channel_id: Snowflake | null;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIBaseGuildMember {
    /**
     * This users guild nickname
     */
    nick?: string | null;
    /**
     * Array of role object ids
     *
     * @see {@link https://discord.com/developers/docs/topics/permissions#role-object}
     */
    roles: Snowflake[];
    /**
     * When the user started boosting the guild
     *
     * @see {@link https://support.discord.com/hc/articles/360028038352}
     */
    premium_since?: string | null;
    /**
     * Whether the user has not yet passed the guild's Membership Screening requirements
     *
     * @remarks If this field is not present, it can be assumed as `false`.
     */
    pending?: boolean;
    /**
     * Timestamp of when the time out will be removed; until then, they cannot interact with the guild
     */
    communication_disabled_until?: string | null;
    /**
     * The data for the member's guild avatar decoration
     *
     * @see {@link https://discord.com/developers/docs/resources/user#avatar-decoration-data-object}
     */
    avatar_decoration_data?: APIAvatarDecorationData | null;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIFlaggedGuildMember {
    /**
     * Guild member flags represented as a bit set
     *
     * @defaultValue `0`
     */
    flags: GuildMemberFlags;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIGuildMemberJoined {
    /**
     * When the user joined the guild
     */
    joined_at: string | null;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIGuildMemberAvatar {
    /**
     * The member's guild avatar hash
     */
    avatar?: string | null;
    /**
     * The member's guild banner hash
     */
    banner?: string | null;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIBaseVoiceGuildMember {
    /**
     * Whether the user is deafened in voice channels
     */
    deaf: boolean;
    /**
     * Whether the user is muted in voice channels
     */
    mute: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIGuildMemberUser {
    /**
     * The user this guild member represents
     *
     * **This field won't be included in the member object attached to `MESSAGE_CREATE` and `MESSAGE_UPDATE` gateway events.**
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    user: APIUser;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
 */
export interface APIGuildMember extends APIBaseGuildMember, APIBaseVoiceGuildMember, APIFlaggedGuildMember, APIGuildMemberAvatar, APIGuildMemberJoined, APIGuildMemberUser {
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object-guild-member-flags}
 */
export declare enum GuildMemberFlags {
    /**
     * Member has left and rejoined the guild
     */
    DidRejoin = 1,
    /**
     * Member has completed onboarding
     */
    CompletedOnboarding = 2,
    /**
     * Member is exempt from guild verification requirements
     */
    BypassesVerification = 4,
    /**
     * Member has started onboarding
     */
    StartedOnboarding = 8,
    /**
     * Member is a guest and can only access the voice channel they were invited to
     */
    IsGuest = 16,
    /**
     * Member has started Server Guide new member actions
     */
    StartedHomeActions = 32,
    /**
     * Member has completed Server Guide new member actions
     */
    CompletedHomeActions = 64,
    /**
     * Member's username, display name, or nickname is blocked by AutoMod
     */
    AutomodQuarantinedUsernameOrGuildNickname = 128,
    /**
     * @deprecated
     * {@link https://github.com/discord/discord-api-docs/pull/7113 | discord-api-docs#7113}
     */
    AutomodQuarantinedBio = 256,
    /**
     * Member has dismissed the DM settings upsell
     */
    DmSettingsUpsellAcknowledged = 512,
    /**
     * Member's guild tag is blocked by AutoMod
     */
    AutoModQuarantinedGuildTag = 1024
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#integration-object}
 */
export interface APIGuildIntegration {
    /**
     * Integration id
     */
    id: Snowflake;
    /**
     * Integration name
     */
    name: string;
    /**
     * Integration type
     */
    type: APIGuildIntegrationType;
    /**
     * Is this integration enabled
     */
    enabled: boolean;
    /**
     * Is this integration syncing
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    syncing?: boolean;
    /**
     * ID that this integration uses for "subscribers"
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    role_id?: Snowflake;
    /**
     * Whether emoticons should be synced for this integration (`twitch` only currently)
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    enable_emoticons?: boolean;
    /**
     * The behavior of expiring subscribers
     *
     * **This field is not provided for `discord` bot integrations.**
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#integration-object-integration-expire-behaviors}
     */
    expire_behavior?: IntegrationExpireBehavior;
    /**
     * The grace period (in days) before expiring subscribers
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    expire_grace_period?: number;
    /**
     * User for this integration
     *
     * **Some older integrations may not have an attached user.**
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    user?: APIUser;
    /**
     * Integration account information
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#integration-account-object}
     */
    account: APIIntegrationAccount;
    /**
     * When this integration was last synced
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    synced_at?: string;
    /**
     * How many subscribers this integration has
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    subscriber_count?: number;
    /**
     * Has this integration been revoked
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    revoked?: boolean;
    /**
     * The bot/OAuth2 application for discord integrations
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#integration-application-object}
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    application?: APIGuildIntegrationApplication;
    /**
     * The scopes the application has been authorized for
     */
    scopes?: OAuth2Scopes[];
}
export type APIGuildIntegrationType = 'discord' | 'guild_subscription' | 'twitch' | 'youtube';
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#integration-object-integration-expire-behaviors}
 */
export declare enum IntegrationExpireBehavior {
    RemoveRole = 0,
    Kick = 1
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#integration-account-object}
 */
export interface APIIntegrationAccount {
    /**
     * ID of the account
     */
    id: string;
    /**
     * Name of the account
     */
    name: string;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#integration-application-object}
 */
export interface APIGuildIntegrationApplication {
    /**
     * The id of the app
     */
    id: Snowflake;
    /**
     * The name of the app
     */
    name: string;
    /**
     * The icon hash of the app
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    icon: string | null;
    /**
     * The description of the app
     */
    description: string;
    /**
     * The bot associated with this application
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    bot?: APIUser;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#ban-object}
 */
export interface APIBan {
    /**
     * The reason for the ban
     */
    reason: string | null;
    /**
     * The banned user
     */
    user: APIUser;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-widget-object}
 */
export interface APIGuildWidget {
    id: Snowflake;
    name: string;
    instant_invite: string | null;
    channels: APIGuildWidgetChannel[];
    members: APIGuildWidgetMember[];
    presence_count: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-widget-object-example-guild-widget}
 */
export interface APIGuildWidgetChannel {
    id: Snowflake;
    name: string;
    position: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-widget-object-example-guild-widget}
 */
export interface APIGuildWidgetMember {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    status: PresenceUpdateReceiveStatus;
    activity?: {
        name: string;
    };
    avatar_url: string;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#get-guild-widget-image-widget-style-options}
 */
export declare enum GuildWidgetStyle {
    /**
     * Shield style widget with Discord icon and guild members online count
     */
    Shield = "shield",
    /**
     * Large image with guild icon, name and online count. "POWERED BY DISCORD" as the footer of the widget
     */
    Banner1 = "banner1",
    /**
     * Smaller widget style with guild icon, name and online count. Split on the right with Discord logo
     */
    Banner2 = "banner2",
    /**
     * Large image with guild icon, name and online count. In the footer, Discord logo on the left and "Chat Now" on the right
     */
    Banner3 = "banner3",
    /**
     * Large Discord logo at the top of the widget. Guild icon, name and online count in the middle portion of the widget
     * and a "JOIN MY SERVER" button at the bottom
     */
    Banner4 = "banner4"
}
export interface APIGuildWelcomeScreen {
    /**
     * The welcome screen short message
     */
    description: string | null;
    /**
     * Array of suggested channels
     */
    welcome_channels: APIGuildWelcomeScreenChannel[];
}
export interface APIGuildWelcomeScreenChannel {
    /**
     * The channel id that is suggested
     */
    channel_id: Snowflake;
    /**
     * The description shown for the channel
     */
    description: string;
    /**
     * The emoji id of the emoji that is shown on the left of the channel
     */
    emoji_id: Snowflake | null;
    /**
     * The emoji name of the emoji that is shown on the left of the channel
     */
    emoji_name: string | null;
}
/**
 * @unstable https://github.com/discord/discord-api-docs/pull/2547
 */
export interface APIGuildMembershipScreening {
    /**
     * When the fields were last updated
     */
    version: string;
    /**
     * The steps in the screening form
     */
    form_fields: APIGuildMembershipScreeningField[];
    /**
     * The server description shown in the screening form
     */
    description: string | null;
}
/**
 * @unstable https://github.com/discord/discord-api-docs/pull/2547
 */
export interface APIGuildMembershipScreeningField {
    /**
     * The type of field
     */
    field_type: MembershipScreeningFieldType;
    /**
     * The title of the field
     */
    label: string;
    /**
     * The list of rules
     */
    values?: string[];
    /**
     * Whether the user has to fill out this field
     */
    required: boolean;
}
/**
 * @unstable https://github.com/discord/discord-api-docs/pull/2547
 */
export declare enum MembershipScreeningFieldType {
    /**
     * Server Rules
     */
    Terms = "TERMS"
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-onboarding-object-guild-onboarding-structure}
 */
export interface APIGuildOnboarding {
    /**
     * Id of the guild this onboarding is part of
     */
    guild_id: Snowflake;
    /**
     * Prompts shown during onboarding and in customize community
     */
    prompts: APIGuildOnboardingPrompt[];
    /**
     * Channel ids that members get opted into automatically
     */
    default_channel_ids: Snowflake[];
    /**
     * Whether onboarding is enabled in the guild
     */
    enabled: boolean;
    /**
     * Current mode of onboarding
     */
    mode: GuildOnboardingMode;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-onboarding-object-onboarding-prompt-structure}
 */
export interface APIGuildOnboardingPrompt {
    /**
     * Id of the prompt
     */
    id: Snowflake;
    /**
     * Options available within the prompt
     */
    options: APIGuildOnboardingPromptOption[];
    /**
     * Title of the prompt
     */
    title: string;
    /**
     * Indicates whether users are limited to selecting one option for the prompt
     */
    single_select: boolean;
    /**
     * Indicates whether the prompt is required before a user completes the onboarding flow
     */
    required: boolean;
    /**
     * Indicates whether the prompt is present in the onboarding flow.
     * If `false`, the prompt will only appear in the Channels & Roles tab
     */
    in_onboarding: boolean;
    /**
     * Type of prompt
     */
    type: GuildOnboardingPromptType;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-onboarding-object-prompt-option-structure}
 */
export interface APIGuildOnboardingPromptOption {
    /**
     * Id of the prompt option
     */
    id: Snowflake;
    /**
     * Ids for channels a member is added to when the option is selected
     */
    channel_ids: Snowflake[];
    /**
     * Ids for roles assigned to a member when the option is selected
     */
    role_ids: Snowflake[];
    /**
     * Emoji of the option
     */
    emoji: APIPartialEmoji;
    /**
     * Title of the option
     */
    title: string;
    /**
     * Description of the option
     */
    description: string | null;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-onboarding-object-onboarding-mode}
 */
export declare enum GuildOnboardingMode {
    /**
     * Counts only Default Channels towards constraints
     */
    OnboardingDefault = 0,
    /**
     * Counts Default Channels and Questions towards constraints
     */
    OnboardingAdvanced = 1
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-onboarding-object-prompt-types}
 */
export declare enum GuildOnboardingPromptType {
    MultipleChoice = 0,
    Dropdown = 1
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#incidents-data-object}
 */
export interface APIIncidentsData {
    /**
     * When invites get enabled again
     */
    invites_disabled_until: string | null;
    /**
     * When direct messages get enabled again
     */
    dms_disabled_until: string | null;
    /**
     * When the dm spam was detected
     */
    dm_spam_detected_at?: string | null;
    /**
     * When the raid was detected
     */
    raid_detected_at?: string | null;
}
//# sourceMappingURL=guild.d.ts.map