import type { Snowflake } from '../../globals';
import type { APIGuildMember } from './guild';
import type { APIUser } from './user';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
interface APIGuildScheduledEventBase<Type extends GuildScheduledEventEntityType> {
    /**
     * The id of the guild event
     */
    id: Snowflake;
    /**
     * The guild id which the scheduled event belongs to
     */
    guild_id: Snowflake;
    /**
     * The channel id in which the scheduled event will be hosted, or `null` if entity type is `EXTERNAL`
     */
    channel_id: Snowflake | null;
    /**
     * The id of the user that created the scheduled event
     */
    creator_id?: Snowflake | null;
    /**
     * The name of the scheduled event
     */
    name: string;
    /**
     * The description of the scheduled event
     */
    description?: string;
    /**
     * The time the scheduled event will start
     */
    scheduled_start_time: string;
    /**
     * The time at which the guild event will end, or `null` if the event does not have a scheduled time to end
     */
    scheduled_end_time: string | null;
    /**
     * The privacy level of the scheduled event
     */
    privacy_level: GuildScheduledEventPrivacyLevel;
    /**
     * The status of the scheduled event
     */
    status: GuildScheduledEventStatus;
    /**
     * The type of hosting entity associated with the scheduled event
     */
    entity_type: Type;
    /**
     * The id of the hosting entity associated with the scheduled event
     */
    entity_id: Snowflake | null;
    /**
     * The entity metadata for the scheduled event
     */
    entity_metadata: APIGuildScheduledEventEntityMetadata | null;
    /**
     * The user that created the scheduled event
     */
    creator?: APIUser;
    /**
     * The number of users subscribed to the scheduled event
     */
    user_count?: number;
    /**
     * The cover image of the scheduled event
     */
    image: string | null;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIStageInstanceGuildScheduledEvent extends APIGuildScheduledEventBase<GuildScheduledEventEntityType.StageInstance> {
    channel_id: Snowflake;
    entity_metadata: null;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIVoiceGuildScheduledEvent extends APIGuildScheduledEventBase<GuildScheduledEventEntityType.Voice> {
    channel_id: Snowflake;
    entity_metadata: null;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIExternalGuildScheduledEvent extends APIGuildScheduledEventBase<GuildScheduledEventEntityType.External> {
    channel_id: null;
    entity_metadata: Required<APIGuildScheduledEventEntityMetadata>;
}
/**
 * https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIGuildScheduledEvent = APIExternalGuildScheduledEvent | APIStageInstanceGuildScheduledEvent | APIVoiceGuildScheduledEvent;
/**
 * https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-entity-metadata
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuildScheduledEventEntityMetadata {
    /**
     * The location of the scheduled event
     */
    location?: string;
}
/**
 * https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-entity-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildScheduledEventEntityType {
    StageInstance = 1,
    Voice = 2,
    External = 3
}
/**
 * https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-status
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildScheduledEventStatus {
    Scheduled = 1,
    Active = 2,
    Completed = 3,
    Canceled = 4
}
/**
 * https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-privacy-level
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum GuildScheduledEventPrivacyLevel {
    /**
     * The scheduled event is only accessible to guild members
     */
    GuildOnly = 2
}
/**
 * https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-user-object-guild-scheduled-event-user-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIGuildScheduledEventUser {
    /**
     * The scheduled event id which the user subscribed to
     */
    guild_scheduled_event_id: Snowflake;
    /**
     * The user which subscribed to the event
     */
    user: APIUser;
    /**
     * The guild member data for this user for the guild which this event belongs to, if any
     */
    member?: APIGuildMember;
}
export {};
//# sourceMappingURL=guildScheduledEvent.d.ts.map