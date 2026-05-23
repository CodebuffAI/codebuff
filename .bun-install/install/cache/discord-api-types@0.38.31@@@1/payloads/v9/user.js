"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/user
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NameplatePalette = exports.ConnectionVisibility = exports.ConnectionService = exports.UserPremiumType = exports.UserFlags = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#user-object-user-flags}
 */
var UserFlags;
(function (UserFlags) {
    /**
     * Discord Employee
     */
    UserFlags[UserFlags["Staff"] = 1] = "Staff";
    /**
     * Partnered Server Owner
     */
    UserFlags[UserFlags["Partner"] = 2] = "Partner";
    /**
     * HypeSquad Events Member
     */
    UserFlags[UserFlags["Hypesquad"] = 4] = "Hypesquad";
    /**
     * Bug Hunter Level 1
     */
    UserFlags[UserFlags["BugHunterLevel1"] = 8] = "BugHunterLevel1";
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    UserFlags[UserFlags["MFASMS"] = 16] = "MFASMS";
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    UserFlags[UserFlags["PremiumPromoDismissed"] = 32] = "PremiumPromoDismissed";
    /**
     * House Bravery Member
     */
    UserFlags[UserFlags["HypeSquadOnlineHouse1"] = 64] = "HypeSquadOnlineHouse1";
    /**
     * House Brilliance Member
     */
    UserFlags[UserFlags["HypeSquadOnlineHouse2"] = 128] = "HypeSquadOnlineHouse2";
    /**
     * House Balance Member
     */
    UserFlags[UserFlags["HypeSquadOnlineHouse3"] = 256] = "HypeSquadOnlineHouse3";
    /**
     * Early Nitro Supporter
     */
    UserFlags[UserFlags["PremiumEarlySupporter"] = 512] = "PremiumEarlySupporter";
    /**
     * User is a {@link https://discord.com/developers/docs/topics/teams | team}
     */
    UserFlags[UserFlags["TeamPseudoUser"] = 1024] = "TeamPseudoUser";
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    UserFlags[UserFlags["HasUnreadUrgentMessages"] = 8192] = "HasUnreadUrgentMessages";
    /**
     * Bug Hunter Level 2
     */
    UserFlags[UserFlags["BugHunterLevel2"] = 16384] = "BugHunterLevel2";
    /**
     * Verified Bot
     */
    UserFlags[UserFlags["VerifiedBot"] = 65536] = "VerifiedBot";
    /**
     * Early Verified Bot Developer
     */
    UserFlags[UserFlags["VerifiedDeveloper"] = 131072] = "VerifiedDeveloper";
    /**
     * Moderator Programs Alumni
     */
    UserFlags[UserFlags["CertifiedModerator"] = 262144] = "CertifiedModerator";
    /**
     * Bot uses only {@link https://discord.com/developers/docs/interactions/receiving-and-responding#receiving-an-interaction | HTTP interactions} and is shown in the online member list
     */
    UserFlags[UserFlags["BotHTTPInteractions"] = 524288] = "BotHTTPInteractions";
    /**
     * User has been identified as spammer
     *
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    UserFlags[UserFlags["Spammer"] = 1048576] = "Spammer";
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    UserFlags[UserFlags["DisablePremium"] = 2097152] = "DisablePremium";
    /**
     * User is an {@link https://support-dev.discord.com/hc/articles/10113997751447 | Active Developer}
     */
    UserFlags[UserFlags["ActiveDeveloper"] = 4194304] = "ActiveDeveloper";
    /**
     * User's account has been {@link https://support.discord.com/hc/articles/6461420677527 | quarantined} based on recent activity
     *
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     * @privateRemarks
     *
     * This value would be `1 << 44`, but bit shifting above `1 << 30` requires bigints
     */
    UserFlags[UserFlags["Quarantined"] = 17592186044416] = "Quarantined";
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     * @privateRemarks
     *
     * This value would be `1 << 50`, but bit shifting above `1 << 30` requires bigints
     */
    UserFlags[UserFlags["Collaborator"] = 1125899906842624] = "Collaborator";
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     * @privateRemarks
     *
     * This value would be `1 << 51`, but bit shifting above `1 << 30` requires bigints
     */
    UserFlags[UserFlags["RestrictedCollaborator"] = 2251799813685248] = "RestrictedCollaborator";
})(UserFlags || (exports.UserFlags = UserFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/user#user-object-premium-types}
 */
var UserPremiumType;
(function (UserPremiumType) {
    UserPremiumType[UserPremiumType["None"] = 0] = "None";
    UserPremiumType[UserPremiumType["NitroClassic"] = 1] = "NitroClassic";
    UserPremiumType[UserPremiumType["Nitro"] = 2] = "Nitro";
    UserPremiumType[UserPremiumType["NitroBasic"] = 3] = "NitroBasic";
})(UserPremiumType || (exports.UserPremiumType = UserPremiumType = {}));
var ConnectionService;
(function (ConnectionService) {
    ConnectionService["AmazonMusic"] = "amazon-music";
    ConnectionService["BattleNet"] = "battlenet";
    ConnectionService["Bluesky"] = "bluesky";
    ConnectionService["BungieNet"] = "bungie";
    ConnectionService["Crunchyroll"] = "crunchyroll";
    ConnectionService["Domain"] = "domain";
    ConnectionService["eBay"] = "ebay";
    ConnectionService["EpicGames"] = "epicgames";
    ConnectionService["Facebook"] = "facebook";
    ConnectionService["GitHub"] = "github";
    ConnectionService["Instagram"] = "instagram";
    ConnectionService["LeagueOfLegends"] = "leagueoflegends";
    ConnectionService["Mastodon"] = "mastodon";
    ConnectionService["PayPal"] = "paypal";
    ConnectionService["PlayStationNetwork"] = "playstation";
    ConnectionService["Reddit"] = "reddit";
    ConnectionService["RiotGames"] = "riotgames";
    ConnectionService["Roblox"] = "roblox";
    ConnectionService["Spotify"] = "spotify";
    ConnectionService["Skype"] = "skype";
    ConnectionService["Steam"] = "steam";
    ConnectionService["TikTok"] = "tiktok";
    ConnectionService["Twitch"] = "twitch";
    ConnectionService["X"] = "twitter";
    /**
     * @deprecated This is the old name for {@link ConnectionService.X}
     */
    ConnectionService["Twitter"] = "twitter";
    ConnectionService["Xbox"] = "xbox";
    ConnectionService["YouTube"] = "youtube";
})(ConnectionService || (exports.ConnectionService = ConnectionService = {}));
var ConnectionVisibility;
(function (ConnectionVisibility) {
    /**
     * Invisible to everyone except the user themselves
     */
    ConnectionVisibility[ConnectionVisibility["None"] = 0] = "None";
    /**
     * Visible to everyone
     */
    ConnectionVisibility[ConnectionVisibility["Everyone"] = 1] = "Everyone";
})(ConnectionVisibility || (exports.ConnectionVisibility = ConnectionVisibility = {}));
/**
 * Background color of a nameplate.
 */
var NameplatePalette;
(function (NameplatePalette) {
    NameplatePalette["Berry"] = "berry";
    NameplatePalette["BubbleGum"] = "bubble_gum";
    NameplatePalette["Clover"] = "clover";
    NameplatePalette["Cobalt"] = "cobalt";
    NameplatePalette["Crimson"] = "crimson";
    NameplatePalette["Forest"] = "forest";
    NameplatePalette["Lemon"] = "lemon";
    NameplatePalette["Sky"] = "sky";
    NameplatePalette["Teal"] = "teal";
    NameplatePalette["Violet"] = "violet";
    NameplatePalette["White"] = "white";
})(NameplatePalette || (exports.NameplatePalette = NameplatePalette = {}));
//# sourceMappingURL=user.js.map