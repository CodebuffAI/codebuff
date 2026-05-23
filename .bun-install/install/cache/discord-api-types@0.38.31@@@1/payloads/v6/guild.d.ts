/**
 * Types extracted from https://discord.com/developers/docs/resources/guild
 */
import type { APIChannel } from './channel';
import type { APIEmoji } from './emoji';
import type { GatewayPresenceUpdate } from './gateway';
import type { APIRole } from './permissions';
import type { APIUser } from './user';
import type { GatewayVoiceState } from './voice';
/**
 * https://discord.com/developers/docs/resources/guild#unavailable-guild-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIUnavailableGuild {
    id: string;
    unavailable: boolean;
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIPartialGuild extends Omit<APIUnavailableGuild, 'unavailable'>, Pick<APIGuild, 'welcome_screen'> {
    name: string;
    icon: string | null;
    splash: string | null;
    banner?: string | null;
    description?: string | null;
    features?: GuildFeature[];
    verification_level?: GuildVerificationLevel;
    vanity_url_code?: string | null;
    unavailable?: boolean;
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuild extends APIPartialGuild {
    discovery_splash: string | null;
    owner?: boolean;
    owner_id: string;
    /**
     * @deprecated Use `permissions_new` instead
     */
    permissions?: number;
    permissions_new?: string;
    region: string;
    afk_channel_id: string | null;
    afk_timeout: number;
    /**
     * @deprecated Use `widget_enabled` instead
     */
    embed_enabled?: boolean;
    /**
     * @deprecated Use `widget_channel_id` instead
     */
    embed_channel_id?: string | null;
    verification_level: GuildVerificationLevel;
    default_message_notifications: GuildDefaultMessageNotifications;
    explicit_content_filter: GuildExplicitContentFilter;
    roles: APIRole[];
    emojis: APIEmoji[];
    features: GuildFeature[];
    mfa_level: GuildMFALevel;
    application_id: string | null;
    widget_enabled?: boolean;
    widget_channel_id?: string | null;
    system_channel_id: string | null;
    system_channel_flags: GuildSystemChannelFlags;
    rules_channel_id: string | null;
    joined_at?: string;
    large?: boolean;
    member_count?: number;
    voice_states?: Omit<GatewayVoiceState, 'guild_id'>[];
    members?: APIGuildMember[];
    channels?: APIChannel[];
    presences?: GatewayPresenceUpdate[];
    max_presences?: number | null;
    max_members?: number;
    vanity_url_code: string | null;
    description: string | null;
    banner: string | null;
    premium_tier: GuildPremiumTier;
    premium_subscription_count?: number;
    preferred_locale: string;
    public_updates_channel_id: string | null;
    max_video_channel_users?: number;
    /**
     * Returned by calling GET `/guilds/{guild.id}` with the query `with_counts` set to `true`
     */
    approximate_member_count?: number;
    /**
     * Returned by calling GET `/guilds/{guild.id}` with the query `with_counts` set to `true`
     */
    approximate_presence_count?: number;
    welcome_screen?: APIGuildWelcomeScreen;
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-default-message-notification-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildDefaultMessageNotifications {
    ALL_MESSAGES = 0,
    ONLY_MENTIONS = 1
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-explicit-content-filter-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildExplicitContentFilter {
    DISABLED = 0,
    MEMBERS_WITHOUT_ROLES = 1,
    ALL_MEMBERS = 2
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-mfa-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildMFALevel {
    NONE = 0,
    ELEVATED = 1
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-verification-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildVerificationLevel {
    NONE = 0,
    LOW = 1,
    MEDIUM = 2,
    HIGH = 3,
    VERY_HIGH = 4
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-premium-tier
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildPremiumTier {
    NONE = 0,
    TIER_1 = 1,
    TIER_2 = 2,
    TIER_3 = 3
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-system-channel-flags
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildSystemChannelFlags {
    SUPPRESS_JOIN_NOTIFICATIONS = 1,
    SUPPRESS_PREMIUM_SUBSCRIPTIONS = 2
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-guild-features
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildFeature {
    ANIMATED_ICON = "ANIMATED_ICON",
    BANNER = "BANNER",
    COMMERCE = "COMMERCE",
    COMMUNITY = "COMMUNITY",
    DISCOVERABLE = "DISCOVERABLE",
    FEATURABLE = "FEATURABLE",
    INVITE_SPLASH = "INVITE_SPLASH",
    NEWS = "NEWS",
    PARTNERED = "PARTNERED",
    RELAY_ENABLED = "RELAY_ENABLED",
    VANITY_URL = "VANITY_URL",
    VERIFIED = "VERIFIED",
    VIP_REGIONS = "VIP_REGIONS",
    WELCOME_SCREEN_ENABLED = "WELCOME_SCREEN_ENABLED"
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-preview-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildPreview {
    id: string;
    name: string;
    icon: string | null;
    splash: string | null;
    discovery_splash: string | null;
    emojis: APIEmoji[];
    features: GuildFeature[];
    approximate_member_count: number;
    approximate_presence_count: number;
}
/**
 * @deprecated Use `APIGuildWidgetSettings` instead
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type APIGuildWidget = APIGuildWidgetSettings;
/**
 * https://discord.com/developers/docs/resources/guild#guild-widget-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildWidgetSettings {
    enabled: boolean;
    channel_id: string | null;
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-member-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildMember {
    user?: APIUser;
    nick: string | null;
    roles: string[];
    joined_at: string;
    premium_since?: string | null;
    deaf: boolean;
    mute: boolean;
}
/**
 * https://discord.com/developers/docs/resources/guild#integration-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildIntegration {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    syncing: boolean;
    role_id: string;
    enable_emoticons?: boolean;
    expire_behavior: IntegrationExpireBehavior;
    expire_grace_period: number;
    user?: APIUser;
    account: APIIntegrationAccount;
    synced_at: string;
    subscriber_count: number;
    revoked: boolean;
    application?: APIGuildIntegrationApplication;
}
/**
 * https://discord.com/developers/docs/resources/guild#integration-object-integration-expire-behaviors
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum IntegrationExpireBehavior {
    RemoveRole = 0,
    Kick = 1
}
/**
 * https://discord.com/developers/docs/resources/guild#integration-account-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIIntegrationAccount {
    id: string;
    name: string;
}
/**
 * https://discord.com/developers/docs/resources/guild#integration-application-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildIntegrationApplication {
    id: string;
    name: string;
    icon: string | null;
    description: string;
    summary: string;
    bot?: APIUser;
}
/**
 * https://discord.com/developers/docs/resources/guild#ban-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIBan {
    reason: string | null;
    user: APIUser;
}
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-image-widget-style-options
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum GuildWidgetStyle {
    Banner1 = "banner1",
    Banner2 = "banner2",
    Banner3 = "banner3",
    Banner4 = "banner4",
    Shield = "shield"
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildWelcomeScreen {
    description: string | null;
    welcome_channels: APIGuildWelcomeScreenChannel[];
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildWelcomeScreenChannel {
    channel_id: string;
    emoji_id: string | null;
    emoji_name: string | null;
}
//# sourceMappingURL=guild.d.ts.map