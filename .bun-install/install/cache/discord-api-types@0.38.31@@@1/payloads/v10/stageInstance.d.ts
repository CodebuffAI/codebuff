import type { Snowflake } from '../../globals';
import type { APIGuildMember } from './guild';
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#stage-instance-object}
 */
export interface APIStageInstance {
    /**
     * The id of the stage instance
     */
    id: Snowflake;
    /**
     * The guild id of the associated stage channel
     */
    guild_id: Snowflake;
    /**
     * The id of the associated stage channel
     */
    channel_id: Snowflake;
    /**
     * The topic of the stage instance (1-120 characters)
     */
    topic: string;
    /**
     * The privacy level of the stage instance
     *
     * @see {@link https://discord.com/developers/docs/resources/stage-instance#stage-instance-object-privacy-level}
     */
    privacy_level: StageInstancePrivacyLevel;
    /**
     * Whether or not stage discovery is disabled
     *
     * @deprecated
     * {@link https://github.com/discord/discord-api-docs/pull/4296 | discord-api-docs#4296}
     */
    discoverable_disabled: boolean;
    /**
     * The id of the scheduled event for this stage instance
     */
    guild_scheduled_event_id?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#stage-instance-object-privacy-level}
 */
export declare enum StageInstancePrivacyLevel {
    /**
     * The stage instance is visible publicly, such as on stage discovery
     *
     * @deprecated
     * {@link https://github.com/discord/discord-api-docs/pull/4296 | discord-api-docs#4296}
     */
    Public = 1,
    /**
     * The stage instance is visible to only guild members
     */
    GuildOnly = 2
}
/**
 * @see {@link https://discord.com/developers/docs/resources/invite#invite-stage-instance-object-invite-stage-instance-structure}
 * @deprecated
 * {@link https://github.com/discord/discord-api-docs/pull/4479 | discord-api-docs#4479}
 */
export interface APIInviteStageInstance {
    /**
     * The topic of the stage instance (1-120 characters)
     */
    topic: string;
    /**
     * The number of users in the stage
     */
    participant_count: number;
    /**
     * The number of users speaking in the stage
     */
    speaker_count: number;
    /**
     * The members speaking in the stage
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object-guild-member-structure}
     */
    members: APIGuildMember[];
}
//# sourceMappingURL=stageInstance.d.ts.map