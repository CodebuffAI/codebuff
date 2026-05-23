/**
 * Types extracted from https://discord.com/developers/docs/resources/guild
 */
import type { Permissions, Snowflake } from '../../globals';
import type { APIChannel } from './channel';
import type { APIEmoji } from './emoji';
import type { GatewayPresenceUpdate, PresenceUpdateStatus } from './gateway';
import type { APIGuildScheduledEvent } from './guildScheduledEvent';
import type { APIRole } from './permissions';
import type { APIStageInstance } from './stageInstance';
import type { APISticker } from './sticker';
import type { APIUser } from './user';
import type { GatewayVoiceState } from './voice';
/**
 * https://discord.com/developers/docs/resources/guild#unavailable-guild-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIUnavailableGuild {
    /**
     * Guild id
     */
    id: Snowflake;
    /**
     * `true` if this guild is unavailable due to an outage
     */
    unavailable: boolean;
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-guild-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIPartialGuild extends Omit<APIUnavailableGuild, 'unavailable'>, Pick<APIGuild, 'welcome_screen'> {
    /**
     * Guild name (2-100 characters, excluding trailing and leading whitespace)
     */
    name: string;
    /**
     * Icon hash
     *
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    icon: string | null;
    /**
     * Splash hash
     *
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    splash: string | null;
    /**
     * Banner hash
     *
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    banner?: string | null;
    /**
     * The description for the guild, if the guild is discoverable
     */
    description?: string | null;
    /**
     * Enabled guild features
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-guild-features
     */
    features?: GuildFeature[];
    /**
     * Verification level required for the guild
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-verification-level
     */
    verification_level?: GuildVerificationLevel;
    /**
     * The vanity url code for the guild
     */
    vanity_url_code?: string | null;
    /**
     * `true` if this guild is unavailable due to an outage
     */
    unavailable?: boolean;
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-guild-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuild extends APIPartialGuild {
    /**
     * Icon hash, returned when in the template object
     *
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    icon_hash?: string | null;
    /**
     * Discovery splash hash; only present for guilds with the "DISCOVERABLE" feature
     *
     * See https://discord.com/developers/docs/reference#image-formatting
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
     * See https://en.wikipedia.org/wiki/Bit_field
     */
    permissions?: Permissions;
    /**
     * Voice region id for the guild
     *
     * See https://discord.com/developers/docs/resources/voice#voice-region-object
     *
     * @deprecated This field has been deprecated in favor of `rtc_region` on the channel.
     */
    region: string;
    /**
     * ID of afk channel
     */
    afk_channel_id: Snowflake | null;
    /**
     * afk timeout in seconds
     */
    afk_timeout: number;
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
     * See https://discord.com/developers/docs/resources/guild#guild-object-verification-level
     */
    verification_level: GuildVerificationLevel;
    /**
     * Default message notifications level
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-default-message-notification-level
     */
    default_message_notifications: GuildDefaultMessageNotifications;
    /**
     * Explicit content filter level
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-explicit-content-filter-level
     */
    explicit_content_filter: GuildExplicitContentFilter;
    /**
     * Roles in the guild
     *
     * See https://discord.com/developers/docs/topics/permissions#role-object
     */
    roles: APIRole[];
    /**
     * Custom guild emojis
     *
     * See https://discord.com/developers/docs/resources/emoji#emoji-object
     */
    emojis: APIEmoji[];
    /**
     * Enabled guild features
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-guild-features
     */
    features: GuildFeature[];
    /**
     * Required MFA level for the guild
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-mfa-level
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
     * See https://discord.com/developers/docs/resources/guild#guild-object-system-channel-flags
     */
    system_channel_flags: GuildSystemChannelFlags;
    /**
     * The id of the channel where Community guilds can display rules and/or guidelines
     */
    rules_channel_id: Snowflake | null;
    /**
     * When this guild was joined at
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     */
    joined_at?: string;
    /**
     * `true` if this is considered a large guild
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     */
    large?: boolean;
    /**
     * Total number of members in this guild
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     */
    member_count?: number;
    /**
     * States of members currently in voice channels; lacks the `guild_id` key
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     *
     * See https://discord.com/developers/docs/resources/voice#voice-state-object
     */
    voice_states?: Omit<GatewayVoiceState, 'guild_id'>[];
    /**
     * Users in the guild
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     *
     * See https://discord.com/developers/docs/resources/guild#guild-member-object
     */
    members?: APIGuildMember[];
    /**
     * Channels in the guild
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     *
     * See https://discord.com/developers/docs/resources/channel#channel-object
     */
    channels?: APIChannel[];
    /**
     * Presences of the members in the guild, will only include non-offline members if the size is greater than `large_threshold`
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     *
     * See https://discord.com/developers/docs/topics/gateway#presence-update
     */
    presences?: GatewayPresenceUpdate[];
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
     * The description for the guild, if the guild is discoverable
     */
    description: string | null;
    /**
     * Banner hash
     *
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    banner: string | null;
    /**
     * Premium tier (Server Boost level)
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-premium-tier
     */
    premium_tier: GuildPremiumTier;
    /**
     * The number of boosts this guild currently has
     */
    premium_subscription_count?: number;
    /**
     * The preferred locale of a Community guild; used in guild discovery and notices from Discord; defaults to "en-US"
     *
     * @default "en-US"
     */
    preferred_locale: string;
    /**
     * The id of the channel where admins and moderators of Community guilds receive notices from Discord
     */
    public_updates_channel_id: Snowflake | null;
    /**
     * The maximum amount of users in a video channel
     */
    max_video_channel_users?: number;
    /**
     * **This field is only received from https://discord.com/developers/docs/resources/guild#get-guild with the `with_counts` query parameter set to `true`**
     */
    approximate_member_count?: number;
    /**
     * **This field is only received from https://discord.com/developers/docs/resources/guild#get-guild with the `with_counts` query parameter set to `true`**
     */
    approximate_presence_count?: number;
    /**
     * The welcome screen of a Community guild, shown to new members
     *
     * Returned in the invite object
     */
    welcome_screen?: APIGuildWelcomeScreen;
    /**
     * The nsfw level of the guild
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-guild-nsfw-level
     */
    nsfw_level: GuildNSFWLevel;
    /**
     * The stage instances in the guild
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     *
     * See https://discord.com/developers/docs/resources/stage-instance#stage-instance-object-stage-instance-structure
     */
    stage_instances?: APIStageInstance[];
    /**
     * Custom guild stickers
     *
     * See https://discord.com/developers/docs/resources/sticker#sticker-object
     */
    stickers: APISticker[];
    /**
     * Whether the guild has the boost progress bar enabled.
     */
    premium_progress_bar_enabled: boolean;
    /**
     * The scheduled events in the guild
     *
     * **This field is only sent within the [GUILD_CREATE](https://discord.com/developers/docs/topics/gateway#guild-create) event**
     *
     * https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object
     */
    guild_scheduled_events?: APIGuildScheduledEvent[];
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-default-message-notification-level
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildDefaultMessageNotifications {
    AllMessages = 0,
    OnlyMentions = 1
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-explicit-content-filter-level
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildExplicitContentFilter {
    Disabled = 0,
    MembersWithoutRoles = 1,
    AllMembers = 2
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-mfa-level
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildMFALevel {
    None = 0,
    Elevated = 1
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-guild-nsfw-level
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildNSFWLevel {
    Default = 0,
    Explicit = 1,
    Safe = 2,
    AgeRestricted = 3
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-verification-level
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * https://discord.com/developers/docs/resources/guild#guild-object-premium-tier
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildPremiumTier {
    None = 0,
    Tier1 = 1,
    Tier2 = 2,
    Tier3 = 3
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-system-channel-flags
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
    SuppressJoinNotificationReplies = 8
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-guild-features
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * Guild has access to set a guild banner image
     */
    Banner = "BANNER",
    /**
     * Guild has access to use commerce features (i.e. create store channels)
     */
    Commerce = "COMMERCE",
    /**
     * Guild can enable welcome screen, Membership Screening and discovery, and receives community updates
     */
    Community = "COMMUNITY",
    /**
     * Guild is able to be discovered in the directory
     */
    Discoverable = "DISCOVERABLE",
    /**
     * Guild is able to be featured in the directory
     */
    Featurable = "FEATURABLE",
    /**
     * Guild has access to set an invite splash background
     */
    InviteSplash = "INVITE_SPLASH",
    /**
     * Guild has enabled Membership Screening
     */
    MemberVerificationGateEnabled = "MEMBER_VERIFICATION_GATE_ENABLED",
    /**
     * Guild has enabled monetization
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
    RelayEnabled = "RELAY_ENABLED",
    /**
     * Guild is able to set role icons
     */
    RoleIcons = "ROLE_ICONS",
    /**
     * Guild has access to the seven day archive time for threads
     */
    SevenDayThreadArchive = "SEVEN_DAY_THREAD_ARCHIVE",
    /**
     * Guild has access to the three day archive time for threads
     */
    ThreeDayThreadArchive = "THREE_DAY_THREAD_ARCHIVE",
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
    WelcomeScreenEnabled = "WELCOME_SCREEN_ENABLED"
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-preview-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    icon: string | null;
    /**
     * Splash hash
     *
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    splash: string | null;
    /**
     * Discovery splash hash; only present for guilds with the "DISCOVERABLE" feature
     *
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    discovery_splash: string | null;
    /**
     * Custom guild emojis
     *
     * See https://discord.com/developers/docs/resources/emoji#emoji-object
     */
    emojis: APIEmoji[];
    /**
     * Enabled guild features
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object-guild-features
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
 * https://discord.com/developers/docs/resources/guild#guild-widget-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * https://discord.com/developers/docs/resources/guild#guild-member-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuildMember {
    /**
     * The user this guild member represents
     *
     * **This field won't be included in the member object attached to `MESSAGE_CREATE` and `MESSAGE_UPDATE` gateway events.**
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    user?: APIUser;
    /**
     * This users guild nickname
     */
    nick?: string | null;
    /**
     * The member's guild avatar hash
     */
    avatar?: string | null;
    /**
     * Array of role object ids
     *
     * See https://discord.com/developers/docs/topics/permissions#role-object
     */
    roles: Snowflake[];
    /**
     * When the user joined the guild
     */
    joined_at: string;
    /**
     * When the user started boosting the guild
     *
     * See https://support.discord.com/hc/en-us/articles/360028038352-Server-Boosting-
     */
    premium_since?: string | null;
    /**
     * Whether the user is deafened in voice channels
     */
    deaf: boolean;
    /**
     * Whether the user is muted in voice channels
     */
    mute: boolean;
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
}
/**
 * https://discord.com/developers/docs/resources/guild#integration-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
    type: APIGuildInteractionType;
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
     * See https://discord.com/developers/docs/resources/guild#integration-object-integration-expire-behaviors
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
     * **This field is not provided for `discord` bot integrations.**
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    user?: APIUser;
    /**
     * Integration account information
     *
     * See https://discord.com/developers/docs/resources/guild#integration-account-object
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
     * See https://discord.com/developers/docs/resources/guild#integration-application-object
     *
     * **This field is not provided for `discord` bot integrations.**
     */
    application?: APIGuildIntegrationApplication;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIGuildInteractionType = 'discord' | 'twitch' | 'youtube';
/**
 * https://discord.com/developers/docs/resources/guild#integration-object-integration-expire-behaviors
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum IntegrationExpireBehavior {
    RemoveRole = 0,
    Kick = 1
}
/**
 * https://discord.com/developers/docs/resources/guild#integration-account-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * https://discord.com/developers/docs/resources/guild#integration-application-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * See https://discord.com/developers/docs/reference#image-formatting
     */
    icon: string | null;
    /**
     * The description of the app
     */
    description: string;
    /**
     * The summary of the app
     *
     * @deprecated Always an empty string, will be removed in v11
     */
    summary: '';
    /**
     * The bot associated with this application
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    bot?: APIUser;
}
/**
 * https://discord.com/developers/docs/resources/guild#ban-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-example-get-guild-widget
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-example-get-guild-widget
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuildWidgetChannel {
    id: Snowflake;
    name: string;
    position: number;
}
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-example-get-guild-widget
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuildWidgetMember {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    status: PresenceUpdateStatus;
    activity?: {
        name: string;
    };
    avatar_url: string;
}
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-image-widget-style-options
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
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
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
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
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum MembershipScreeningFieldType {
    /**
     * Server Rules
     */
    Terms = "TERMS"
}
//# sourceMappingURL=guild.d.ts.map