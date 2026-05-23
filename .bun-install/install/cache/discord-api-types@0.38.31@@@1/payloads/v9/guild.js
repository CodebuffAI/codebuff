"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/guild
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuildOnboardingPromptType = exports.GuildOnboardingMode = exports.MembershipScreeningFieldType = exports.GuildWidgetStyle = exports.IntegrationExpireBehavior = exports.GuildMemberFlags = exports.GuildFeature = exports.GuildSystemChannelFlags = exports.GuildHubType = exports.GuildPremiumTier = exports.GuildVerificationLevel = exports.GuildNSFWLevel = exports.GuildMFALevel = exports.GuildExplicitContentFilter = exports.GuildDefaultMessageNotifications = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-default-message-notification-level}
 */
var GuildDefaultMessageNotifications;
(function (GuildDefaultMessageNotifications) {
    GuildDefaultMessageNotifications[GuildDefaultMessageNotifications["AllMessages"] = 0] = "AllMessages";
    GuildDefaultMessageNotifications[GuildDefaultMessageNotifications["OnlyMentions"] = 1] = "OnlyMentions";
})(GuildDefaultMessageNotifications || (exports.GuildDefaultMessageNotifications = GuildDefaultMessageNotifications = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-explicit-content-filter-level}
 */
var GuildExplicitContentFilter;
(function (GuildExplicitContentFilter) {
    GuildExplicitContentFilter[GuildExplicitContentFilter["Disabled"] = 0] = "Disabled";
    GuildExplicitContentFilter[GuildExplicitContentFilter["MembersWithoutRoles"] = 1] = "MembersWithoutRoles";
    GuildExplicitContentFilter[GuildExplicitContentFilter["AllMembers"] = 2] = "AllMembers";
})(GuildExplicitContentFilter || (exports.GuildExplicitContentFilter = GuildExplicitContentFilter = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-mfa-level}
 */
var GuildMFALevel;
(function (GuildMFALevel) {
    GuildMFALevel[GuildMFALevel["None"] = 0] = "None";
    GuildMFALevel[GuildMFALevel["Elevated"] = 1] = "Elevated";
})(GuildMFALevel || (exports.GuildMFALevel = GuildMFALevel = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-nsfw-level}
 */
var GuildNSFWLevel;
(function (GuildNSFWLevel) {
    GuildNSFWLevel[GuildNSFWLevel["Default"] = 0] = "Default";
    GuildNSFWLevel[GuildNSFWLevel["Explicit"] = 1] = "Explicit";
    GuildNSFWLevel[GuildNSFWLevel["Safe"] = 2] = "Safe";
    GuildNSFWLevel[GuildNSFWLevel["AgeRestricted"] = 3] = "AgeRestricted";
})(GuildNSFWLevel || (exports.GuildNSFWLevel = GuildNSFWLevel = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-verification-level}
 */
var GuildVerificationLevel;
(function (GuildVerificationLevel) {
    /**
     * Unrestricted
     */
    GuildVerificationLevel[GuildVerificationLevel["None"] = 0] = "None";
    /**
     * Must have verified email on account
     */
    GuildVerificationLevel[GuildVerificationLevel["Low"] = 1] = "Low";
    /**
     * Must be registered on Discord for longer than 5 minutes
     */
    GuildVerificationLevel[GuildVerificationLevel["Medium"] = 2] = "Medium";
    /**
     * Must be a member of the guild for longer than 10 minutes
     */
    GuildVerificationLevel[GuildVerificationLevel["High"] = 3] = "High";
    /**
     * Must have a verified phone number
     */
    GuildVerificationLevel[GuildVerificationLevel["VeryHigh"] = 4] = "VeryHigh";
})(GuildVerificationLevel || (exports.GuildVerificationLevel = GuildVerificationLevel = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-premium-tier}
 */
var GuildPremiumTier;
(function (GuildPremiumTier) {
    GuildPremiumTier[GuildPremiumTier["None"] = 0] = "None";
    GuildPremiumTier[GuildPremiumTier["Tier1"] = 1] = "Tier1";
    GuildPremiumTier[GuildPremiumTier["Tier2"] = 2] = "Tier2";
    GuildPremiumTier[GuildPremiumTier["Tier3"] = 3] = "Tier3";
})(GuildPremiumTier || (exports.GuildPremiumTier = GuildPremiumTier = {}));
var GuildHubType;
(function (GuildHubType) {
    GuildHubType[GuildHubType["Default"] = 0] = "Default";
    GuildHubType[GuildHubType["HighSchool"] = 1] = "HighSchool";
    GuildHubType[GuildHubType["College"] = 2] = "College";
})(GuildHubType || (exports.GuildHubType = GuildHubType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-system-channel-flags}
 */
var GuildSystemChannelFlags;
(function (GuildSystemChannelFlags) {
    /**
     * Suppress member join notifications
     */
    GuildSystemChannelFlags[GuildSystemChannelFlags["SuppressJoinNotifications"] = 1] = "SuppressJoinNotifications";
    /**
     * Suppress server boost notifications
     */
    GuildSystemChannelFlags[GuildSystemChannelFlags["SuppressPremiumSubscriptions"] = 2] = "SuppressPremiumSubscriptions";
    /**
     * Suppress server setup tips
     */
    GuildSystemChannelFlags[GuildSystemChannelFlags["SuppressGuildReminderNotifications"] = 4] = "SuppressGuildReminderNotifications";
    /**
     * Hide member join sticker reply buttons
     */
    GuildSystemChannelFlags[GuildSystemChannelFlags["SuppressJoinNotificationReplies"] = 8] = "SuppressJoinNotificationReplies";
})(GuildSystemChannelFlags || (exports.GuildSystemChannelFlags = GuildSystemChannelFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-object-guild-features}
 */
var GuildFeature;
(function (GuildFeature) {
    /**
     * Guild has access to set an animated guild banner image
     */
    GuildFeature["AnimatedBanner"] = "ANIMATED_BANNER";
    /**
     * Guild has access to set an animated guild icon
     */
    GuildFeature["AnimatedIcon"] = "ANIMATED_ICON";
    /**
     * Guild is using the old permissions configuration behavior
     *
     * @see {@link https://discord.com/developers/docs/change-log#upcoming-application-command-permission-changes}
     */
    GuildFeature["ApplicationCommandPermissionsV2"] = "APPLICATION_COMMAND_PERMISSIONS_V2";
    /**
     * Guild has set up auto moderation rules
     */
    GuildFeature["AutoModeration"] = "AUTO_MODERATION";
    /**
     * Guild has access to set a guild banner image
     */
    GuildFeature["Banner"] = "BANNER";
    /**
     * Guild can enable welcome screen, Membership Screening and discovery, and receives community updates
     */
    GuildFeature["Community"] = "COMMUNITY";
    /**
     * Guild has enabled monetization
     */
    GuildFeature["CreatorMonetizableProvisional"] = "CREATOR_MONETIZABLE_PROVISIONAL";
    /**
     * Guild has enabled the role subscription promo page
     */
    GuildFeature["CreatorStorePage"] = "CREATOR_STORE_PAGE";
    /**
     * Guild has been set as a support server on the App Directory
     */
    GuildFeature["DeveloperSupportServer"] = "DEVELOPER_SUPPORT_SERVER";
    /**
     * Guild is able to be discovered in the directory
     */
    GuildFeature["Discoverable"] = "DISCOVERABLE";
    /**
     * Guild is able to be featured in the directory
     */
    GuildFeature["Featurable"] = "FEATURABLE";
    /**
     * Guild is listed in a directory channel
     */
    GuildFeature["HasDirectoryEntry"] = "HAS_DIRECTORY_ENTRY";
    /**
     * Guild is a Student Hub
     *
     * @see {@link https://support.discord.com/hc/articles/4406046651927}
     * @unstable This feature is currently not documented by Discord, but has known value
     */
    GuildFeature["Hub"] = "HUB";
    /**
     * Guild has disabled invite usage, preventing users from joining
     */
    GuildFeature["InvitesDisabled"] = "INVITES_DISABLED";
    /**
     * Guild has access to set an invite splash background
     */
    GuildFeature["InviteSplash"] = "INVITE_SPLASH";
    /**
     * Guild is in a Student Hub
     *
     * @see {@link https://support.discord.com/hc/articles/4406046651927}
     * @unstable This feature is currently not documented by Discord, but has known value
     */
    GuildFeature["LinkedToHub"] = "LINKED_TO_HUB";
    /**
     * Guild has enabled Membership Screening
     */
    GuildFeature["MemberVerificationGateEnabled"] = "MEMBER_VERIFICATION_GATE_ENABLED";
    /**
     * Guild has increased custom soundboard sound slots
     */
    GuildFeature["MoreSoundboard"] = "MORE_SOUNDBOARD";
    /**
     * Guild has enabled monetization
     *
     * @unstable This feature is no longer documented by Discord
     */
    GuildFeature["MonetizationEnabled"] = "MONETIZATION_ENABLED";
    /**
     * Guild has increased custom sticker slots
     */
    GuildFeature["MoreStickers"] = "MORE_STICKERS";
    /**
     * Guild has access to create news channels
     */
    GuildFeature["News"] = "NEWS";
    /**
     * Guild is partnered
     */
    GuildFeature["Partnered"] = "PARTNERED";
    /**
     * Guild can be previewed before joining via Membership Screening or the directory
     */
    GuildFeature["PreviewEnabled"] = "PREVIEW_ENABLED";
    /**
     * Guild has access to create private threads
     */
    GuildFeature["PrivateThreads"] = "PRIVATE_THREADS";
    /**
     * Guild has disabled alerts for join raids in the configured safety alerts channel
     */
    GuildFeature["RaidAlertsDisabled"] = "RAID_ALERTS_DISABLED";
    GuildFeature["RelayEnabled"] = "RELAY_ENABLED";
    /**
     * Guild is able to set role icons
     */
    GuildFeature["RoleIcons"] = "ROLE_ICONS";
    /**
     * Guild has role subscriptions that can be purchased
     */
    GuildFeature["RoleSubscriptionsAvailableForPurchase"] = "ROLE_SUBSCRIPTIONS_AVAILABLE_FOR_PURCHASE";
    /**
     * Guild has enabled role subscriptions
     */
    GuildFeature["RoleSubscriptionsEnabled"] = "ROLE_SUBSCRIPTIONS_ENABLED";
    /**
     * Guild has created soundboard sounds
     */
    GuildFeature["Soundboard"] = "SOUNDBOARD";
    /**
     * Guild has enabled ticketed events
     */
    GuildFeature["TicketedEventsEnabled"] = "TICKETED_EVENTS_ENABLED";
    /**
     * Guild has access to set a vanity URL
     */
    GuildFeature["VanityURL"] = "VANITY_URL";
    /**
     * Guild is verified
     */
    GuildFeature["Verified"] = "VERIFIED";
    /**
     * Guild has access to set 384kbps bitrate in voice (previously VIP voice servers)
     */
    GuildFeature["VIPRegions"] = "VIP_REGIONS";
    /**
     * Guild has enabled the welcome screen
     */
    GuildFeature["WelcomeScreenEnabled"] = "WELCOME_SCREEN_ENABLED";
    /**
     * Guild has access to set guild tags
     */
    GuildFeature["GuildTags"] = "GUILD_TAGS";
    /**
     * Guild is able to set gradient colors to roles
     */
    GuildFeature["EnhancedRoleColors"] = "ENHANCED_ROLE_COLORS";
    /**
     * Guild has access to guest invites
     */
    GuildFeature["GuestsEnabled"] = "GUESTS_ENABLED";
    /**
     * Guild has migrated to the new pin messages permission
     *
     * @unstable This feature is currently not documented by Discord, but has known value
     */
    GuildFeature["PinPermissionMigrationComplete"] = "PIN_PERMISSION_MIGRATION_COMPLETE";
})(GuildFeature || (exports.GuildFeature = GuildFeature = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object-guild-member-flags}
 */
var GuildMemberFlags;
(function (GuildMemberFlags) {
    /**
     * Member has left and rejoined the guild
     */
    GuildMemberFlags[GuildMemberFlags["DidRejoin"] = 1] = "DidRejoin";
    /**
     * Member has completed onboarding
     */
    GuildMemberFlags[GuildMemberFlags["CompletedOnboarding"] = 2] = "CompletedOnboarding";
    /**
     * Member is exempt from guild verification requirements
     */
    GuildMemberFlags[GuildMemberFlags["BypassesVerification"] = 4] = "BypassesVerification";
    /**
     * Member has started onboarding
     */
    GuildMemberFlags[GuildMemberFlags["StartedOnboarding"] = 8] = "StartedOnboarding";
    /**
     * Member is a guest and can only access the voice channel they were invited to
     */
    GuildMemberFlags[GuildMemberFlags["IsGuest"] = 16] = "IsGuest";
    /**
     * Member has started Server Guide new member actions
     */
    GuildMemberFlags[GuildMemberFlags["StartedHomeActions"] = 32] = "StartedHomeActions";
    /**
     * Member has completed Server Guide new member actions
     */
    GuildMemberFlags[GuildMemberFlags["CompletedHomeActions"] = 64] = "CompletedHomeActions";
    /**
     * Member's username, display name, or nickname is blocked by AutoMod
     */
    GuildMemberFlags[GuildMemberFlags["AutomodQuarantinedUsernameOrGuildNickname"] = 128] = "AutomodQuarantinedUsernameOrGuildNickname";
    /**
     * @deprecated
     * {@link https://github.com/discord/discord-api-docs/pull/7113 | discord-api-docs#7113}
     */
    GuildMemberFlags[GuildMemberFlags["AutomodQuarantinedBio"] = 256] = "AutomodQuarantinedBio";
    /**
     * Member has dismissed the DM settings upsell
     */
    GuildMemberFlags[GuildMemberFlags["DmSettingsUpsellAcknowledged"] = 512] = "DmSettingsUpsellAcknowledged";
    /**
     * Member's guild tag is blocked by AutoMod
     */
    GuildMemberFlags[GuildMemberFlags["AutoModQuarantinedGuildTag"] = 1024] = "AutoModQuarantinedGuildTag";
})(GuildMemberFlags || (exports.GuildMemberFlags = GuildMemberFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#integration-object-integration-expire-behaviors}
 */
var IntegrationExpireBehavior;
(function (IntegrationExpireBehavior) {
    IntegrationExpireBehavior[IntegrationExpireBehavior["RemoveRole"] = 0] = "RemoveRole";
    IntegrationExpireBehavior[IntegrationExpireBehavior["Kick"] = 1] = "Kick";
})(IntegrationExpireBehavior || (exports.IntegrationExpireBehavior = IntegrationExpireBehavior = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#get-guild-widget-image-widget-style-options}
 */
var GuildWidgetStyle;
(function (GuildWidgetStyle) {
    /**
     * Shield style widget with Discord icon and guild members online count
     */
    GuildWidgetStyle["Shield"] = "shield";
    /**
     * Large image with guild icon, name and online count. "POWERED BY DISCORD" as the footer of the widget
     */
    GuildWidgetStyle["Banner1"] = "banner1";
    /**
     * Smaller widget style with guild icon, name and online count. Split on the right with Discord logo
     */
    GuildWidgetStyle["Banner2"] = "banner2";
    /**
     * Large image with guild icon, name and online count. In the footer, Discord logo on the left and "Chat Now" on the right
     */
    GuildWidgetStyle["Banner3"] = "banner3";
    /**
     * Large Discord logo at the top of the widget. Guild icon, name and online count in the middle portion of the widget
     * and a "JOIN MY SERVER" button at the bottom
     */
    GuildWidgetStyle["Banner4"] = "banner4";
})(GuildWidgetStyle || (exports.GuildWidgetStyle = GuildWidgetStyle = {}));
/**
 * @unstable https://github.com/discord/discord-api-docs/pull/2547
 */
var MembershipScreeningFieldType;
(function (MembershipScreeningFieldType) {
    /**
     * Server Rules
     */
    MembershipScreeningFieldType["Terms"] = "TERMS";
})(MembershipScreeningFieldType || (exports.MembershipScreeningFieldType = MembershipScreeningFieldType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-onboarding-object-onboarding-mode}
 */
var GuildOnboardingMode;
(function (GuildOnboardingMode) {
    /**
     * Counts only Default Channels towards constraints
     */
    GuildOnboardingMode[GuildOnboardingMode["OnboardingDefault"] = 0] = "OnboardingDefault";
    /**
     * Counts Default Channels and Questions towards constraints
     */
    GuildOnboardingMode[GuildOnboardingMode["OnboardingAdvanced"] = 1] = "OnboardingAdvanced";
})(GuildOnboardingMode || (exports.GuildOnboardingMode = GuildOnboardingMode = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/guild#guild-onboarding-object-prompt-types}
 */
var GuildOnboardingPromptType;
(function (GuildOnboardingPromptType) {
    GuildOnboardingPromptType[GuildOnboardingPromptType["MultipleChoice"] = 0] = "MultipleChoice";
    GuildOnboardingPromptType[GuildOnboardingPromptType["Dropdown"] = 1] = "Dropdown";
})(GuildOnboardingPromptType || (exports.GuildOnboardingPromptType = GuildOnboardingPromptType = {}));
//# sourceMappingURL=guild.js.map