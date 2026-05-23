"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/auto-moderation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoModerationActionType = exports.AutoModerationRuleEventType = exports.AutoModerationRuleKeywordPresetType = exports.AutoModerationRuleTriggerType = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-trigger-types}
 */
var AutoModerationRuleTriggerType;
(function (AutoModerationRuleTriggerType) {
    /**
     * Check if content contains words from a user defined list of keywords (Maximum of 6 per guild)
     */
    AutoModerationRuleTriggerType[AutoModerationRuleTriggerType["Keyword"] = 1] = "Keyword";
    /**
     * Check if content represents generic spam (Maximum of 1 per guild)
     */
    AutoModerationRuleTriggerType[AutoModerationRuleTriggerType["Spam"] = 3] = "Spam";
    /**
     * Check if content contains words from internal pre-defined wordsets (Maximum of 1 per guild)
     */
    AutoModerationRuleTriggerType[AutoModerationRuleTriggerType["KeywordPreset"] = 4] = "KeywordPreset";
    /**
     * Check if content contains more mentions than allowed (Maximum of 1 per guild)
     */
    AutoModerationRuleTriggerType[AutoModerationRuleTriggerType["MentionSpam"] = 5] = "MentionSpam";
    /**
     * Check if member profile contains words from a user defined list of keywords (Maximum of 1 per guild)
     */
    AutoModerationRuleTriggerType[AutoModerationRuleTriggerType["MemberProfile"] = 6] = "MemberProfile";
})(AutoModerationRuleTriggerType || (exports.AutoModerationRuleTriggerType = AutoModerationRuleTriggerType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-keyword-preset-types}
 */
var AutoModerationRuleKeywordPresetType;
(function (AutoModerationRuleKeywordPresetType) {
    /**
     * Words that may be considered forms of swearing or cursing
     */
    AutoModerationRuleKeywordPresetType[AutoModerationRuleKeywordPresetType["Profanity"] = 1] = "Profanity";
    /**
     * Words that refer to sexually explicit behavior or activity
     */
    AutoModerationRuleKeywordPresetType[AutoModerationRuleKeywordPresetType["SexualContent"] = 2] = "SexualContent";
    /**
     * Personal insults or words that may be considered hate speech
     */
    AutoModerationRuleKeywordPresetType[AutoModerationRuleKeywordPresetType["Slurs"] = 3] = "Slurs";
})(AutoModerationRuleKeywordPresetType || (exports.AutoModerationRuleKeywordPresetType = AutoModerationRuleKeywordPresetType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-event-types}
 */
var AutoModerationRuleEventType;
(function (AutoModerationRuleEventType) {
    /**
     * When a member sends or edits a message in the guild
     */
    AutoModerationRuleEventType[AutoModerationRuleEventType["MessageSend"] = 1] = "MessageSend";
    /**
     * When a member edits their profile
     */
    AutoModerationRuleEventType[AutoModerationRuleEventType["MemberUpdate"] = 2] = "MemberUpdate";
})(AutoModerationRuleEventType || (exports.AutoModerationRuleEventType = AutoModerationRuleEventType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-action-object-action-types}
 */
var AutoModerationActionType;
(function (AutoModerationActionType) {
    /**
     * Blocks a member's message and prevents it from being posted.
     * A custom explanation can be specified and shown to members whenever their message is blocked
     */
    AutoModerationActionType[AutoModerationActionType["BlockMessage"] = 1] = "BlockMessage";
    /**
     * Logs user content to a specified channel
     */
    AutoModerationActionType[AutoModerationActionType["SendAlertMessage"] = 2] = "SendAlertMessage";
    /**
     * Timeout user for specified duration, this action type can be set if the bot has `MODERATE_MEMBERS` permission
     */
    AutoModerationActionType[AutoModerationActionType["Timeout"] = 3] = "Timeout";
    /**
     * Prevents a member from using text, voice, or other interactions
     */
    AutoModerationActionType[AutoModerationActionType["BlockMemberInteraction"] = 4] = "BlockMemberInteraction";
})(AutoModerationActionType || (exports.AutoModerationActionType = AutoModerationActionType = {}));
//# sourceMappingURL=autoModeration.js.map