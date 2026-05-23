import type { Snowflake } from '../../globals';
import type { APIGuildMember } from './guild';
/**
 * https://discord.com/developers/docs/resources/stage-instance#stage-instance-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * See https://discord.com/developers/docs/resources/stage-instance#stage-instance-object-privacy-level
     */
    privacy_level: StageInstancePrivacyLevel;
    /**
     * Whether or not stage discovery is disabled
     */
    discoverable_disabled: boolean;
}
/**
 * https://discord.com/developers/docs/resources/stage-instance#stage-instance-object-privacy-level
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum StageInstancePrivacyLevel {
    /**
     * The stage instance is visible publicly, such as on stage discovery
     */
    Public = 1,
    /**
     * The stage instance is visible to only guild members
     */
    GuildOnly = 2
}
/**
 * https://discord.com/developers/docs/resources/invite#invite-stage-instance-object-invite-stage-instance-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * See https://discord.com/developers/docs/resources/guild#guild-member-object-guild-member-structure
     */
    members: APIGuildMember[];
}
//# sourceMappingURL=stageInstance.d.ts.map