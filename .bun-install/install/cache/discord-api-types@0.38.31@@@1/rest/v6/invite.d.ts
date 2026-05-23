import type { APIInvite } from '../../payloads/v6/index';
/**
 * https://discord.com/developers/docs/resources/invite#get-invite
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIInviteQuery {
    with_counts?: boolean;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIInviteResult = APIInvite;
/**
 * https://discord.com/developers/docs/resources/invite#delete-invite
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIInviteResult = APIInvite;
//# sourceMappingURL=invite.d.ts.map