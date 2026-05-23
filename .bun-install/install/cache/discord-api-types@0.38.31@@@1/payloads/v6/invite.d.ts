/**
 * Types extracted from https://discord.com/developers/docs/resources/invite
 */
import type { APIPartialChannel } from './channel';
import type { APIPartialGuild } from './guild';
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/resources/invite#invite-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIInvite {
    code: string;
    guild?: APIPartialGuild;
    channel?: Required<APIPartialChannel>;
    inviter?: APIUser;
    target_user?: APIUser;
    target_user_type?: InviteTargetUserType;
    approximate_presence_count?: number;
    approximate_member_count?: number;
}
/**
 * https://discord.com/developers/docs/resources/invite#invite-object-target-user-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum InviteTargetUserType {
    STREAM = 1
}
/**
 * https://discord.com/developers/docs/resources/invite#invite-metadata-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIExtendedInvite extends APIInvite {
    uses: number;
    max_uses: number;
    max_age: number;
    temporary: boolean;
    created_at: string;
}
//# sourceMappingURL=invite.d.ts.map