"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/user
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionVisibility = exports.UserPremiumType = exports.UserFlags = void 0;
/**
 * https://discord.com/developers/docs/resources/user#user-object-user-flags
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var UserFlags;
(function (UserFlags) {
    UserFlags[UserFlags["None"] = 0] = "None";
    UserFlags[UserFlags["DiscordEmployee"] = 1] = "DiscordEmployee";
    UserFlags[UserFlags["PartneredServerOwner"] = 2] = "PartneredServerOwner";
    UserFlags[UserFlags["DiscordHypeSquadEvents"] = 4] = "DiscordHypeSquadEvents";
    UserFlags[UserFlags["BugHunterLevel1"] = 8] = "BugHunterLevel1";
    UserFlags[UserFlags["HypeSquadHouseBravery"] = 64] = "HypeSquadHouseBravery";
    UserFlags[UserFlags["HypeSquadHouseBrilliance"] = 128] = "HypeSquadHouseBrilliance";
    UserFlags[UserFlags["HypeSquadHouseBalance"] = 256] = "HypeSquadHouseBalance";
    UserFlags[UserFlags["EarlySupporter"] = 512] = "EarlySupporter";
    UserFlags[UserFlags["TeamUser"] = 1024] = "TeamUser";
    UserFlags[UserFlags["System"] = 4096] = "System";
    UserFlags[UserFlags["BugHunterLevel2"] = 16384] = "BugHunterLevel2";
    UserFlags[UserFlags["VerifiedBot"] = 65536] = "VerifiedBot";
    UserFlags[UserFlags["EarlyVerifiedBotDeveloper"] = 131072] = "EarlyVerifiedBotDeveloper";
})(UserFlags || (exports.UserFlags = UserFlags = {}));
/**
 * https://discord.com/developers/docs/resources/user#user-object-premium-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var UserPremiumType;
(function (UserPremiumType) {
    UserPremiumType[UserPremiumType["None"] = 0] = "None";
    UserPremiumType[UserPremiumType["NitroClassic"] = 1] = "NitroClassic";
    UserPremiumType[UserPremiumType["Nitro"] = 2] = "Nitro";
})(UserPremiumType || (exports.UserPremiumType = UserPremiumType = {}));
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var ConnectionVisibility;
(function (ConnectionVisibility) {
    ConnectionVisibility[ConnectionVisibility["None"] = 0] = "None";
    ConnectionVisibility[ConnectionVisibility["Everyone"] = 1] = "Everyone";
})(ConnectionVisibility || (exports.ConnectionVisibility = ConnectionVisibility = {}));
//# sourceMappingURL=user.js.map