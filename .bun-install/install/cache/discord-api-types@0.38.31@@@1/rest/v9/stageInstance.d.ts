import type { Snowflake } from '../../globals';
import type { APIStageInstance, StageInstancePrivacyLevel } from '../../payloads/v9/index';
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#create-stage-instance}
 */
export interface RESTPostAPIStageInstanceJSONBody {
    /**
     * The id of the stage channel
     */
    channel_id: Snowflake;
    /**
     * The topic of the stage instance (1-120 characters)
     */
    topic: string;
    /**
     * The privacy level of the stage instance
     *
     * @defaultValue `StageInstancePrivacyLevel.GuildOnly`
     */
    privacy_level?: StageInstancePrivacyLevel | undefined;
    /**
     * Notify `@everyone` that a stage instance has started
     */
    send_start_notification?: boolean | undefined;
    /**
     * The guild scheduled event associated with this stage instance
     */
    guild_scheduled_event_id?: Snowflake | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#create-stage-instance}
 */
export type RESTPostAPIStageInstanceResult = APIStageInstance;
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#get-stage-instance}
 */
export type RESTGetAPIStageInstanceResult = APIStageInstance;
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#modify-stage-instance}
 */
export interface RESTPatchAPIStageInstanceJSONBody {
    /**
     * The topic of the stage instance (1-120 characters)
     */
    topic?: string | undefined;
    /**
     * The privacy level of the stage instance
     */
    privacy_level?: StageInstancePrivacyLevel | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#modify-stage-instance}
 */
export type RESTPatchAPIStageInstanceResult = APIStageInstance;
/**
 * @see {@link https://discord.com/developers/docs/resources/stage-instance#delete-stage-instance}
 */
export type RESTDeleteAPIStageInstanceResult = never;
//# sourceMappingURL=stageInstance.d.ts.map