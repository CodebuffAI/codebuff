"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/audit-log
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogOptionsType = exports.AuditLogEvent = void 0;
/**
 * https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-events
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var AuditLogEvent;
(function (AuditLogEvent) {
    AuditLogEvent[AuditLogEvent["GUILD_UPDATE"] = 1] = "GUILD_UPDATE";
    AuditLogEvent[AuditLogEvent["CHANNEL_CREATE"] = 10] = "CHANNEL_CREATE";
    AuditLogEvent[AuditLogEvent["CHANNEL_UPDATE"] = 11] = "CHANNEL_UPDATE";
    AuditLogEvent[AuditLogEvent["CHANNEL_DELETE"] = 12] = "CHANNEL_DELETE";
    AuditLogEvent[AuditLogEvent["CHANNEL_OVERWRITE_CREATE"] = 13] = "CHANNEL_OVERWRITE_CREATE";
    AuditLogEvent[AuditLogEvent["CHANNEL_OVERWRITE_UPDATE"] = 14] = "CHANNEL_OVERWRITE_UPDATE";
    AuditLogEvent[AuditLogEvent["CHANNEL_OVERWRITE_DELETE"] = 15] = "CHANNEL_OVERWRITE_DELETE";
    AuditLogEvent[AuditLogEvent["MEMBER_KICK"] = 20] = "MEMBER_KICK";
    AuditLogEvent[AuditLogEvent["MEMBER_PRUNE"] = 21] = "MEMBER_PRUNE";
    AuditLogEvent[AuditLogEvent["MEMBER_BAN_ADD"] = 22] = "MEMBER_BAN_ADD";
    AuditLogEvent[AuditLogEvent["MEMBER_BAN_REMOVE"] = 23] = "MEMBER_BAN_REMOVE";
    AuditLogEvent[AuditLogEvent["MEMBER_UPDATE"] = 24] = "MEMBER_UPDATE";
    AuditLogEvent[AuditLogEvent["MEMBER_ROLE_UPDATE"] = 25] = "MEMBER_ROLE_UPDATE";
    AuditLogEvent[AuditLogEvent["MEMBER_MOVE"] = 26] = "MEMBER_MOVE";
    AuditLogEvent[AuditLogEvent["MEMBER_DISCONNECT"] = 27] = "MEMBER_DISCONNECT";
    AuditLogEvent[AuditLogEvent["BOT_ADD"] = 28] = "BOT_ADD";
    AuditLogEvent[AuditLogEvent["ROLE_CREATE"] = 30] = "ROLE_CREATE";
    AuditLogEvent[AuditLogEvent["ROLE_UPDATE"] = 31] = "ROLE_UPDATE";
    AuditLogEvent[AuditLogEvent["ROLE_DELETE"] = 32] = "ROLE_DELETE";
    AuditLogEvent[AuditLogEvent["INVITE_CREATE"] = 40] = "INVITE_CREATE";
    AuditLogEvent[AuditLogEvent["INVITE_UPDATE"] = 41] = "INVITE_UPDATE";
    AuditLogEvent[AuditLogEvent["INVITE_DELETE"] = 42] = "INVITE_DELETE";
    AuditLogEvent[AuditLogEvent["WEBHOOK_CREATE"] = 50] = "WEBHOOK_CREATE";
    AuditLogEvent[AuditLogEvent["WEBHOOK_UPDATE"] = 51] = "WEBHOOK_UPDATE";
    AuditLogEvent[AuditLogEvent["WEBHOOK_DELETE"] = 52] = "WEBHOOK_DELETE";
    AuditLogEvent[AuditLogEvent["EMOJI_CREATE"] = 60] = "EMOJI_CREATE";
    AuditLogEvent[AuditLogEvent["EMOJI_UPDATE"] = 61] = "EMOJI_UPDATE";
    AuditLogEvent[AuditLogEvent["EMOJI_DELETE"] = 62] = "EMOJI_DELETE";
    AuditLogEvent[AuditLogEvent["MESSAGE_DELETE"] = 72] = "MESSAGE_DELETE";
    AuditLogEvent[AuditLogEvent["MESSAGE_BULK_DELETE"] = 73] = "MESSAGE_BULK_DELETE";
    AuditLogEvent[AuditLogEvent["MESSAGE_PIN"] = 74] = "MESSAGE_PIN";
    AuditLogEvent[AuditLogEvent["MESSAGE_UNPIN"] = 75] = "MESSAGE_UNPIN";
    AuditLogEvent[AuditLogEvent["INTEGRATION_CREATE"] = 80] = "INTEGRATION_CREATE";
    AuditLogEvent[AuditLogEvent["INTEGRATION_UPDATE"] = 81] = "INTEGRATION_UPDATE";
    AuditLogEvent[AuditLogEvent["INTEGRATION_DELETE"] = 82] = "INTEGRATION_DELETE";
})(AuditLogEvent || (exports.AuditLogEvent = AuditLogEvent = {}));
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var AuditLogOptionsType;
(function (AuditLogOptionsType) {
    AuditLogOptionsType["Member"] = "member";
    AuditLogOptionsType["Role"] = "role";
})(AuditLogOptionsType || (exports.AuditLogOptionsType = AuditLogOptionsType = {}));
//# sourceMappingURL=auditLog.js.map