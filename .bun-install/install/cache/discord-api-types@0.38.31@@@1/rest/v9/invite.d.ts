import type { Snowflake } from '../../globals';
import type { APIInvite } from '../../payloads/v9/index';
/**
 * @see {@link https://discord.com/developers/docs/resources/invite#get-invite}
 */
export interface RESTGetAPIInviteQuery {
    /**
     * Whether the invite should contain approximate member counts
     */
    with_counts?: boolean;
    /**
     * Whether the invite should contain the expiration date
     *
     * @deprecated The expiration date is always returned, regardless of this query parameter.
     * @see {@link https://github.com/discord/discord-api-docs/pull/7424}
     */
    with_expiration?: boolean;
    /**
     * The guild scheduled event to include with the invite
     */
    guild_scheduled_event_id?: Snowflake;
}
export type RESTGetAPIInviteResult = APIInvite;
/**
 * @see {@link https://discord.com/developers/docs/resources/invite#delete-invite}
 */
export type RESTDeleteAPIInviteResult = APIInvite;
//# sourceMappingURL=invite.d.ts.map