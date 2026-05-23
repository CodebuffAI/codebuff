"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/topics/gateway
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityFlags = exports.ActivityType = exports.PresenceUpdateStatus = void 0;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
var PresenceUpdateStatus;
(function (PresenceUpdateStatus) {
    PresenceUpdateStatus["DoNotDisturb"] = "dnd";
    PresenceUpdateStatus["Idle"] = "idle";
    PresenceUpdateStatus["Invisible"] = "invisible";
    PresenceUpdateStatus["Offline"] = "offline";
    PresenceUpdateStatus["Online"] = "online";
})(PresenceUpdateStatus || (exports.PresenceUpdateStatus = PresenceUpdateStatus = {}));
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var ActivityType;
(function (ActivityType) {
    ActivityType[ActivityType["Game"] = 0] = "Game";
    ActivityType[ActivityType["Streaming"] = 1] = "Streaming";
    ActivityType[ActivityType["Listening"] = 2] = "Listening";
    ActivityType[ActivityType["Custom"] = 4] = "Custom";
    ActivityType[ActivityType["Competing"] = 5] = "Competing";
})(ActivityType || (exports.ActivityType = ActivityType = {}));
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-flags
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var ActivityFlags;
(function (ActivityFlags) {
    ActivityFlags[ActivityFlags["INSTANCE"] = 1] = "INSTANCE";
    ActivityFlags[ActivityFlags["JOIN"] = 2] = "JOIN";
    ActivityFlags[ActivityFlags["SPECTATE"] = 4] = "SPECTATE";
    ActivityFlags[ActivityFlags["JOIN_REQUEST"] = 8] = "JOIN_REQUEST";
    ActivityFlags[ActivityFlags["SYNC"] = 16] = "SYNC";
    ActivityFlags[ActivityFlags["PLAY"] = 32] = "PLAY";
})(ActivityFlags || (exports.ActivityFlags = ActivityFlags = {}));
//# sourceMappingURL=gateway.js.map