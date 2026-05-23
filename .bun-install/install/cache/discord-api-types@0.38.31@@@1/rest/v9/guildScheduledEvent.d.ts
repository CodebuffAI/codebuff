import type { Snowflake } from '../../globals';
import type { _Nullable, _StrictPartial } from '../../utils/internals';
import type { APIGuildScheduledEvent, APIGuildScheduledEventEntityMetadata, APIGuildScheduledEventRecurrenceRule, APIGuildScheduledEventUser, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, GuildScheduledEventStatus } from '../../v9';
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#list-scheduled-events-for-guild}
 */
export interface RESTGetAPIGuildScheduledEventsQuery {
    /**
     * Whether to include number of users subscribed to each event
     */
    with_user_count?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#list-scheduled-events-for-guild}
 */
export type RESTGetAPIGuildScheduledEventsResult = APIGuildScheduledEvent[];
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#create-guild-scheduled-event}
 */
export interface RESTPostAPIGuildScheduledEventJSONBody {
    /**
     * The stage channel id of the guild event
     */
    channel_id?: Snowflake | undefined;
    /**
     * The name of the guild event
     */
    name: string;
    /**
     * The privacy level of the guild event
     */
    privacy_level: GuildScheduledEventPrivacyLevel;
    /**
     * The time to schedule the guild event at
     */
    scheduled_start_time: string;
    /**
     * The time when the scheduled event is scheduled to end
     */
    scheduled_end_time?: string | undefined;
    /**
     * The description of the guild event
     */
    description?: string | undefined;
    /**
     * The scheduled entity type of the guild event
     */
    entity_type?: GuildScheduledEventEntityType | undefined;
    /**
     * The entity metadata of the scheduled event
     */
    entity_metadata?: APIGuildScheduledEventEntityMetadata | undefined;
    /**
     * The cover image of the scheduled event
     */
    image?: string | null | undefined;
    /**
     * The definition for how often this event should recur
     */
    recurrence_rule?: APIGuildScheduledEventRecurrenceRule | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#create-guild-scheduled-event}
 */
export type RESTPostAPIGuildScheduledEventResult = APIGuildScheduledEvent;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#get-guild-scheduled-event}
 */
export interface RESTGetAPIGuildScheduledEventQuery {
    /**
     * Whether to include number of users subscribed to this event
     */
    with_user_count?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#get-guild-scheduled-event}
 */
export type RESTGetAPIGuildScheduledEventResult = APIGuildScheduledEvent;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#modify-guild-scheduled-event}
 */
export interface RESTPatchAPIGuildScheduledEventJSONBody extends _Nullable<Pick<RESTPostAPIGuildScheduledEventJSONBody, 'description' | 'entity_metadata' | 'recurrence_rule'>>, _StrictPartial<Omit<RESTPostAPIGuildScheduledEventJSONBody, 'description' | 'entity_metadata' | 'recurrence_rule'>> {
    /**
     * The status of the scheduled event
     */
    status?: GuildScheduledEventStatus | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#modify-guild-scheduled-event}
 */
export type RESTPatchAPIGuildScheduledEventResult = APIGuildScheduledEvent;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#delete-guild-scheduled-event}
 */
export type RESTDeleteAPIGuildScheduledEventResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#get-guild-scheduled-event-users}
 */
export interface RESTGetAPIGuildScheduledEventUsersQuery {
    /**
     * Number of users to receive from the event
     *
     * @defaultValue `100`
     */
    limit?: number;
    /**
     * Whether to include guild member data if it exists
     */
    with_member?: boolean;
    /**
     * Consider only users before given user id
     */
    before?: Snowflake;
    /**
     * Consider only users after given user id
     */
    after?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#get-guild-scheduled-event-users}
 */
export type RESTGetAPIGuildScheduledEventUsersResult = APIGuildScheduledEventUser[];
//# sourceMappingURL=guildScheduledEvent.d.ts.map