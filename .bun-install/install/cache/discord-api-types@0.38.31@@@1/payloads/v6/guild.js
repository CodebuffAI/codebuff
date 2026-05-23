"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/guild
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuildWidgetStyle = exports.IntegrationExpireBehavior = exports.GuildFeature = exports.GuildSystemChannelFlags = exports.GuildPremiumTier = exports.GuildVerificationLevel = exports.GuildMFALevel = exports.GuildExplicitContentFilter = exports.GuildDefaultMessageNotifications = void 0;
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-default-message-notification-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildDefaultMessageNotifications;
(function (GuildDefaultMessageNotifications) {
    GuildDefaultMessageNotifications[GuildDefaultMessageNotifications["ALL_MESSAGES"] = 0] = "ALL_MESSAGES";
    GuildDefaultMessageNotifications[GuildDefaultMessageNotifications["ONLY_MENTIONS"] = 1] = "ONLY_MENTIONS";
})(GuildDefaultMessageNotifications || (exports.GuildDefaultMessageNotifications = GuildDefaultMessageNotifications = {}));
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-explicit-content-filter-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildExplicitContentFilter;
(function (GuildExplicitContentFilter) {
    GuildExplicitContentFilter[GuildExplicitContentFilter["DISABLED"] = 0] = "DISABLED";
    GuildExplicitContentFilter[GuildExplicitContentFilter["MEMBERS_WITHOUT_ROLES"] = 1] = "MEMBERS_WITHOUT_ROLES";
    GuildExplicitContentFilter[GuildExplicitContentFilter["ALL_MEMBERS"] = 2] = "ALL_MEMBERS";
})(GuildExplicitContentFilter || (exports.GuildExplicitContentFilter = GuildExplicitContentFilter = {}));
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-mfa-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildMFALevel;
(function (GuildMFALevel) {
    GuildMFALevel[GuildMFALevel["NONE"] = 0] = "NONE";
    GuildMFALevel[GuildMFALevel["ELEVATED"] = 1] = "ELEVATED";
})(GuildMFALevel || (exports.GuildMFALevel = GuildMFALevel = {}));
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-verification-level
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildVerificationLevel;
(function (GuildVerificationLevel) {
    GuildVerificationLevel[GuildVerificationLevel["NONE"] = 0] = "NONE";
    GuildVerificationLevel[GuildVerificationLevel["LOW"] = 1] = "LOW";
    GuildVerificationLevel[GuildVerificationLevel["MEDIUM"] = 2] = "MEDIUM";
    GuildVerificationLevel[GuildVerificationLevel["HIGH"] = 3] = "HIGH";
    GuildVerificationLevel[GuildVerificationLevel["VERY_HIGH"] = 4] = "VERY_HIGH";
})(GuildVerificationLevel || (exports.GuildVerificationLevel = GuildVerificationLevel = {}));
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-premium-tier
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildPremiumTier;
(function (GuildPremiumTier) {
    GuildPremiumTier[GuildPremiumTier["NONE"] = 0] = "NONE";
    GuildPremiumTier[GuildPremiumTier["TIER_1"] = 1] = "TIER_1";
    GuildPremiumTier[GuildPremiumTier["TIER_2"] = 2] = "TIER_2";
    GuildPremiumTier[GuildPremiumTier["TIER_3"] = 3] = "TIER_3";
})(GuildPremiumTier || (exports.GuildPremiumTier = GuildPremiumTier = {}));
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-system-channel-flags
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildSystemChannelFlags;
(function (GuildSystemChannelFlags) {
    GuildSystemChannelFlags[GuildSystemChannelFlags["SUPPRESS_JOIN_NOTIFICATIONS"] = 1] = "SUPPRESS_JOIN_NOTIFICATIONS";
    GuildSystemChannelFlags[GuildSystemChannelFlags["SUPPRESS_PREMIUM_SUBSCRIPTIONS"] = 2] = "SUPPRESS_PREMIUM_SUBSCRIPTIONS";
})(GuildSystemChannelFlags || (exports.GuildSystemChannelFlags = GuildSystemChannelFlags = {}));
/**
 * https://discord.com/developers/docs/resources/guild#guild-object-guild-features
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildFeature;
(function (GuildFeature) {
    GuildFeature["ANIMATED_ICON"] = "ANIMATED_ICON";
    GuildFeature["BANNER"] = "BANNER";
    GuildFeature["COMMERCE"] = "COMMERCE";
    GuildFeature["COMMUNITY"] = "COMMUNITY";
    GuildFeature["DISCOVERABLE"] = "DISCOVERABLE";
    GuildFeature["FEATURABLE"] = "FEATURABLE";
    GuildFeature["INVITE_SPLASH"] = "INVITE_SPLASH";
    GuildFeature["NEWS"] = "NEWS";
    GuildFeature["PARTNERED"] = "PARTNERED";
    GuildFeature["RELAY_ENABLED"] = "RELAY_ENABLED";
    GuildFeature["VANITY_URL"] = "VANITY_URL";
    GuildFeature["VERIFIED"] = "VERIFIED";
    GuildFeature["VIP_REGIONS"] = "VIP_REGIONS";
    GuildFeature["WELCOME_SCREEN_ENABLED"] = "WELCOME_SCREEN_ENABLED";
})(GuildFeature || (exports.GuildFeature = GuildFeature = {}));
/**
 * https://discord.com/developers/docs/resources/guild#integration-object-integration-expire-behaviors
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var IntegrationExpireBehavior;
(function (IntegrationExpireBehavior) {
    IntegrationExpireBehavior[IntegrationExpireBehavior["RemoveRole"] = 0] = "RemoveRole";
    IntegrationExpireBehavior[IntegrationExpireBehavior["Kick"] = 1] = "Kick";
})(IntegrationExpireBehavior || (exports.IntegrationExpireBehavior = IntegrationExpireBehavior = {}));
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-image-widget-style-options
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var GuildWidgetStyle;
(function (GuildWidgetStyle) {
    GuildWidgetStyle["Banner1"] = "banner1";
    GuildWidgetStyle["Banner2"] = "banner2";
    GuildWidgetStyle["Banner3"] = "banner3";
    GuildWidgetStyle["Banner4"] = "banner4";
    GuildWidgetStyle["Shield"] = "shield";
})(GuildWidgetStyle || (exports.GuildWidgetStyle = GuildWidgetStyle = {}));
//# sourceMappingURL=guild.js.map