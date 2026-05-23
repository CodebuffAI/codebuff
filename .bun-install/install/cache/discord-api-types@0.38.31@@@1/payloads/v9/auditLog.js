"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/audit-log
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogOptionsType = exports.AuditLogEvent = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/audit-log#audit-log-entry-object-audit-log-events}
 */
var AuditLogEvent;
(function (AuditLogEvent) {
    AuditLogEvent[AuditLogEvent["GuildUpdate"] = 1] = "GuildUpdate";
    AuditLogEvent[AuditLogEvent["ChannelCreate"] = 10] = "ChannelCreate";
    AuditLogEvent[AuditLogEvent["ChannelUpdate"] = 11] = "ChannelUpdate";
    AuditLogEvent[AuditLogEvent["ChannelDelete"] = 12] = "ChannelDelete";
    AuditLogEvent[AuditLogEvent["ChannelOverwriteCreate"] = 13] = "ChannelOverwriteCreate";
    AuditLogEvent[AuditLogEvent["ChannelOverwriteUpdate"] = 14] = "ChannelOverwriteUpdate";
    AuditLogEvent[AuditLogEvent["ChannelOverwriteDelete"] = 15] = "ChannelOverwriteDelete";
    AuditLogEvent[AuditLogEvent["MemberKick"] = 20] = "MemberKick";
    AuditLogEvent[AuditLogEvent["MemberPrune"] = 21] = "MemberPrune";
    AuditLogEvent[AuditLogEvent["MemberBanAdd"] = 22] = "MemberBanAdd";
    AuditLogEvent[AuditLogEvent["MemberBanRemove"] = 23] = "MemberBanRemove";
    AuditLogEvent[AuditLogEvent["MemberUpdate"] = 24] = "MemberUpdate";
    AuditLogEvent[AuditLogEvent["MemberRoleUpdate"] = 25] = "MemberRoleUpdate";
    AuditLogEvent[AuditLogEvent["MemberMove"] = 26] = "MemberMove";
    AuditLogEvent[AuditLogEvent["MemberDisconnect"] = 27] = "MemberDisconnect";
    AuditLogEvent[AuditLogEvent["BotAdd"] = 28] = "BotAdd";
    AuditLogEvent[AuditLogEvent["RoleCreate"] = 30] = "RoleCreate";
    AuditLogEvent[AuditLogEvent["RoleUpdate"] = 31] = "RoleUpdate";
    AuditLogEvent[AuditLogEvent["RoleDelete"] = 32] = "RoleDelete";
    AuditLogEvent[AuditLogEvent["InviteCreate"] = 40] = "InviteCreate";
    AuditLogEvent[AuditLogEvent["InviteUpdate"] = 41] = "InviteUpdate";
    AuditLogEvent[AuditLogEvent["InviteDelete"] = 42] = "InviteDelete";
    AuditLogEvent[AuditLogEvent["WebhookCreate"] = 50] = "WebhookCreate";
    AuditLogEvent[AuditLogEvent["WebhookUpdate"] = 51] = "WebhookUpdate";
    AuditLogEvent[AuditLogEvent["WebhookDelete"] = 52] = "WebhookDelete";
    AuditLogEvent[AuditLogEvent["EmojiCreate"] = 60] = "EmojiCreate";
    AuditLogEvent[AuditLogEvent["EmojiUpdate"] = 61] = "EmojiUpdate";
    AuditLogEvent[AuditLogEvent["EmojiDelete"] = 62] = "EmojiDelete";
    AuditLogEvent[AuditLogEvent["MessageDelete"] = 72] = "MessageDelete";
    AuditLogEvent[AuditLogEvent["MessageBulkDelete"] = 73] = "MessageBulkDelete";
    AuditLogEvent[AuditLogEvent["MessagePin"] = 74] = "MessagePin";
    AuditLogEvent[AuditLogEvent["MessageUnpin"] = 75] = "MessageUnpin";
    AuditLogEvent[AuditLogEvent["IntegrationCreate"] = 80] = "IntegrationCreate";
    AuditLogEvent[AuditLogEvent["IntegrationUpdate"] = 81] = "IntegrationUpdate";
    AuditLogEvent[AuditLogEvent["IntegrationDelete"] = 82] = "IntegrationDelete";
    AuditLogEvent[AuditLogEvent["StageInstanceCreate"] = 83] = "StageInstanceCreate";
    AuditLogEvent[AuditLogEvent["StageInstanceUpdate"] = 84] = "StageInstanceUpdate";
    AuditLogEvent[AuditLogEvent["StageInstanceDelete"] = 85] = "StageInstanceDelete";
    AuditLogEvent[AuditLogEvent["StickerCreate"] = 90] = "StickerCreate";
    AuditLogEvent[AuditLogEvent["StickerUpdate"] = 91] = "StickerUpdate";
    AuditLogEvent[AuditLogEvent["StickerDelete"] = 92] = "StickerDelete";
    AuditLogEvent[AuditLogEvent["GuildScheduledEventCreate"] = 100] = "GuildScheduledEventCreate";
    AuditLogEvent[AuditLogEvent["GuildScheduledEventUpdate"] = 101] = "GuildScheduledEventUpdate";
    AuditLogEvent[AuditLogEvent["GuildScheduledEventDelete"] = 102] = "GuildScheduledEventDelete";
    AuditLogEvent[AuditLogEvent["ThreadCreate"] = 110] = "ThreadCreate";
    AuditLogEvent[AuditLogEvent["ThreadUpdate"] = 111] = "ThreadUpdate";
    AuditLogEvent[AuditLogEvent["ThreadDelete"] = 112] = "ThreadDelete";
    AuditLogEvent[AuditLogEvent["ApplicationCommandPermissionUpdate"] = 121] = "ApplicationCommandPermissionUpdate";
    AuditLogEvent[AuditLogEvent["SoundboardSoundCreate"] = 130] = "SoundboardSoundCreate";
    AuditLogEvent[AuditLogEvent["SoundboardSoundUpdate"] = 131] = "SoundboardSoundUpdate";
    AuditLogEvent[AuditLogEvent["SoundboardSoundDelete"] = 132] = "SoundboardSoundDelete";
    AuditLogEvent[AuditLogEvent["AutoModerationRuleCreate"] = 140] = "AutoModerationRuleCreate";
    AuditLogEvent[AuditLogEvent["AutoModerationRuleUpdate"] = 141] = "AutoModerationRuleUpdate";
    AuditLogEvent[AuditLogEvent["AutoModerationRuleDelete"] = 142] = "AutoModerationRuleDelete";
    AuditLogEvent[AuditLogEvent["AutoModerationBlockMessage"] = 143] = "AutoModerationBlockMessage";
    AuditLogEvent[AuditLogEvent["AutoModerationFlagToChannel"] = 144] = "AutoModerationFlagToChannel";
    AuditLogEvent[AuditLogEvent["AutoModerationUserCommunicationDisabled"] = 145] = "AutoModerationUserCommunicationDisabled";
    AuditLogEvent[AuditLogEvent["AutoModerationQuarantineUser"] = 146] = "AutoModerationQuarantineUser";
    AuditLogEvent[AuditLogEvent["CreatorMonetizationRequestCreated"] = 150] = "CreatorMonetizationRequestCreated";
    AuditLogEvent[AuditLogEvent["CreatorMonetizationTermsAccepted"] = 151] = "CreatorMonetizationTermsAccepted";
    AuditLogEvent[AuditLogEvent["OnboardingPromptCreate"] = 163] = "OnboardingPromptCreate";
    AuditLogEvent[AuditLogEvent["OnboardingPromptUpdate"] = 164] = "OnboardingPromptUpdate";
    AuditLogEvent[AuditLogEvent["OnboardingPromptDelete"] = 165] = "OnboardingPromptDelete";
    AuditLogEvent[AuditLogEvent["OnboardingCreate"] = 166] = "OnboardingCreate";
    AuditLogEvent[AuditLogEvent["OnboardingUpdate"] = 167] = "OnboardingUpdate";
    AuditLogEvent[AuditLogEvent["HomeSettingsCreate"] = 190] = "HomeSettingsCreate";
    AuditLogEvent[AuditLogEvent["HomeSettingsUpdate"] = 191] = "HomeSettingsUpdate";
})(AuditLogEvent || (exports.AuditLogEvent = AuditLogEvent = {}));
var AuditLogOptionsType;
(function (AuditLogOptionsType) {
    AuditLogOptionsType["Role"] = "0";
    AuditLogOptionsType["Member"] = "1";
})(AuditLogOptionsType || (exports.AuditLogOptionsType = AuditLogOptionsType = {}));
//# sourceMappingURL=auditLog.js.map