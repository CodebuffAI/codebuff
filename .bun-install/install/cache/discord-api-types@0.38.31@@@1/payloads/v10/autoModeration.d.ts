/**
 * Types extracted from https://discord.com/developers/docs/resources/auto-moderation
 */
import type { Snowflake } from '../../globals';
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-auto-moderation-rule-structure}
 */
export interface APIAutoModerationRule {
    /**
     * The id of this rule
     */
    id: Snowflake;
    /**
     * The guild which this rule belongs to
     */
    guild_id: Snowflake;
    /**
     * The rule name
     */
    name: string;
    /**
     * The user id who created this rule
     */
    creator_id: Snowflake;
    /**
     * The rule event type
     */
    event_type: AutoModerationRuleEventType;
    /**
     * The rule trigger type
     */
    trigger_type: AutoModerationRuleTriggerType;
    /**
     * The rule trigger metadata
     */
    trigger_metadata: APIAutoModerationRuleTriggerMetadata;
    /**
     * The actions which will execute when this rule is triggered
     */
    actions: APIAutoModerationAction[];
    /**
     * Whether this rule is enabled
     */
    enabled: boolean;
    /**
     * The role ids that shouldn't be affected by this rule (Maximum of 20)
     */
    exempt_roles: Snowflake[];
    /**
     * The channel ids that shouldn't be affected by this rule (Maximum of 50)
     */
    exempt_channels: Snowflake[];
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-trigger-types}
 */
export declare enum AutoModerationRuleTriggerType {
    /**
     * Check if content contains words from a user defined list of keywords (Maximum of 6 per guild)
     */
    Keyword = 1,
    /**
     * Check if content represents generic spam (Maximum of 1 per guild)
     */
    Spam = 3,
    /**
     * Check if content contains words from internal pre-defined wordsets (Maximum of 1 per guild)
     */
    KeywordPreset = 4,
    /**
     * Check if content contains more mentions than allowed (Maximum of 1 per guild)
     */
    MentionSpam = 5,
    /**
     * Check if member profile contains words from a user defined list of keywords (Maximum of 1 per guild)
     */
    MemberProfile = 6
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-trigger-metadata}
 */
export interface APIAutoModerationRuleTriggerMetadata {
    /**
     * Substrings which will be searched for in content (Maximum of 1000)
     *
     * A keyword can be a phrase which contains multiple words. Wildcard symbols can be used to customize how each string will be matched. Each keyword must be 60 characters or less
     *
     * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-keyword-matching-strategies | Keyword matching strategies}
     *
     * Associated trigger types: {@link AutoModerationRuleTriggerType.Keyword}, {@link AutoModerationRuleTriggerType.MemberProfile}
     */
    keyword_filter?: string[];
    /**
     * The internally pre-defined wordsets which will be searched for in content
     *
     * Associated trigger type: {@link AutoModerationRuleTriggerType.KeywordPreset}
     */
    presets?: AutoModerationRuleKeywordPresetType[];
    /**
     * Substrings which will be exempt from triggering the preset trigger type (Maximum of 1000)
     *
     * A allowed-word can be a phrase which contains multiple words. Wildcard symbols can be used to customize how each string will be matched. Each keyword must be 60 characters or less
     *
     * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-keyword-matching-strategies | Keyword matching strategies}
     *
     * Associated trigger types: {@link AutoModerationRuleTriggerType.Keyword}, {@link AutoModerationRuleTriggerType.KeywordPreset}, {@link AutoModerationRuleTriggerType.MemberProfile}
     */
    allow_list?: string[];
    /**
     * Regular expression patterns which will be matched against content (Maximum of 10)
     *
     * Only Rust flavored regex is currently supported (Maximum of 260 characters)
     *
     * Associated trigger types: {@link AutoModerationRuleTriggerType.Keyword}, {@link AutoModerationRuleTriggerType.MemberProfile}
     */
    regex_patterns?: string[];
    /**
     * Total number of mentions (role & user) allowed per message (Maximum of 50)
     *
     * Associated trigger type: {@link AutoModerationRuleTriggerType.MentionSpam}
     */
    mention_total_limit?: number;
    /**
     * Whether to automatically detect mention raids
     *
     * Associated trigger type: {@link AutoModerationRuleTriggerType.MentionSpam}
     */
    mention_raid_protection_enabled?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-keyword-preset-types}
 */
export declare enum AutoModerationRuleKeywordPresetType {
    /**
     * Words that may be considered forms of swearing or cursing
     */
    Profanity = 1,
    /**
     * Words that refer to sexually explicit behavior or activity
     */
    SexualContent = 2,
    /**
     * Personal insults or words that may be considered hate speech
     */
    Slurs = 3
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-rule-object-event-types}
 */
export declare enum AutoModerationRuleEventType {
    /**
     * When a member sends or edits a message in the guild
     */
    MessageSend = 1,
    /**
     * When a member edits their profile
     */
    MemberUpdate = 2
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-action-object-auto-moderation-action-structure}
 */
export interface APIAutoModerationAction {
    /**
     * The action type
     */
    type: AutoModerationActionType;
    /**
     * Additional metadata needed during execution for this specific action type
     *
     * Will only be omitted if the action type is {@link AutoModerationActionType.BlockMessage}
     */
    metadata?: APIAutoModerationActionMetadata;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-action-object-action-types}
 */
export declare enum AutoModerationActionType {
    /**
     * Blocks a member's message and prevents it from being posted.
     * A custom explanation can be specified and shown to members whenever their message is blocked
     */
    BlockMessage = 1,
    /**
     * Logs user content to a specified channel
     */
    SendAlertMessage = 2,
    /**
     * Timeout user for specified duration, this action type can be set if the bot has `MODERATE_MEMBERS` permission
     */
    Timeout = 3,
    /**
     * Prevents a member from using text, voice, or other interactions
     */
    BlockMemberInteraction = 4
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#auto-moderation-action-object-action-metadata}
 */
export interface APIAutoModerationActionMetadata {
    /**
     * Channel to which user content should be logged
     *
     * Associated action type: {@link AutoModerationActionType.SendAlertMessage}
     */
    channel_id?: Snowflake;
    /**
     * Timeout duration in seconds (Maximum of 4 weeks - 2419200 seconds)
     *
     * Only available if using {@link AutoModerationRuleTriggerType.Keyword}
     *
     * Associated action type: {@link AutoModerationActionType.Timeout}
     */
    duration_seconds?: number;
    /**
     * Additional explanation that will be shown to members whenever their message is blocked (Maximum 150 characters)
     *
     * Associated action type {@link AutoModerationActionType.BlockMessage}
     */
    custom_message?: string;
}
//# sourceMappingURL=autoModeration.d.ts.map