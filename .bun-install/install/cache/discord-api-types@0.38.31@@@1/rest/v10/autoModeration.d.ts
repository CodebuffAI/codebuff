import type { Snowflake } from '../../globals';
import type { APIAutoModerationAction, APIAutoModerationRule, AutoModerationRuleEventType, APIAutoModerationRuleTriggerMetadata, AutoModerationRuleTriggerType } from '../../payloads/v10/index';
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#list-auto-moderation-rules-for-guild}
 */
export type RESTGetAPIAutoModerationRulesResult = APIAutoModerationRule[];
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#get-auto-moderation-rule}
 */
export type RESTGetAPIAutoModerationRuleResult = APIAutoModerationRule;
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#create-auto-moderation-rule}
 */
export interface RESTPostAPIAutoModerationRuleJSONBody {
    /**
     * The rule name
     */
    name: string;
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
     *
     * Can be omitted if the trigger type is {@link AutoModerationRuleTriggerType.Spam}
     */
    trigger_metadata?: APIAutoModerationRuleTriggerMetadata | undefined;
    /**
     * The actions which will execute when this rule is triggered
     */
    actions: APIAutoModerationAction[];
    /**
     * Whether this rule is enabled
     *
     * @defaultValue `false`
     */
    enabled?: boolean | undefined;
    /**
     * The role ids that shouldn't be affected by this rule (Maximum of 20)
     */
    exempt_roles?: Snowflake[] | undefined;
    /**
     * The channel ids that shouldn't be affected by this rule (Maximum of 50)
     */
    exempt_channels?: Snowflake[] | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#create-auto-moderation-rule}
 */
export type RESTPostAPIAutoModerationRuleResult = APIAutoModerationRule;
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#modify-auto-moderation-rule}
 */
export type RESTPatchAPIAutoModerationRuleJSONBody = Omit<Partial<RESTPostAPIAutoModerationRuleJSONBody>, 'trigger_type'>;
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#modify-auto-moderation-rule}
 */
export type RESTPatchAPIAutoModerationRuleResult = APIAutoModerationRule;
/**
 * @see {@link https://discord.com/developers/docs/resources/auto-moderation#delete-auto-moderation-rule}
 */
export type RESTDeleteAPIAutoModerationRuleResult = never;
//# sourceMappingURL=autoModeration.d.ts.map