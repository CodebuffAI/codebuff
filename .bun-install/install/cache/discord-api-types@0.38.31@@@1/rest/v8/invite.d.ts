import type { Snowflake } from '../../globals';
import type { APIInvite } from '../../payloads/v8/index';
/**
 * https://discord.com/developers/docs/resources/invite#get-invite
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTGetAPIInviteQuery {
    /**
     * Whether the invite should contain approximate member counts
     */
    with_counts?: boolean;
    /**
     * Whether the invite should contain the expiration date
     */
    with_expiration?: boolean;
    /**
     * The guild scheduled event to include with the invite
     */
    guild_scheduled_event_id?: Snowflake;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIInviteResult = APIInvite;
/**
 * https://discord.com/developers/docs/resources/invite#delete-invite
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIInviteResult = APIInvite;
//# sourceMappingURL=invite.d.ts.map