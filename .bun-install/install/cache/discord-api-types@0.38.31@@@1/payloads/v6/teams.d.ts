/**
 * Types extracted from https://discord.com/developers/docs/topics/teams
 */
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/topics/teams#data-models-team-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APITeam {
    id: string;
    icon: string | null;
    members: APITeamMember[];
    owner_user_id: string;
}
/**
 * https://discord.com/developers/docs/topics/teams#data-models-team-members-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APITeamMember {
    membership_state: TeamMemberMembershipState;
    permissions: string[];
    team_id: string;
    user: APIUser;
}
/**
 * https://discord.com/developers/docs/topics/teams#data-models-membership-state-enum
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum TeamMemberMembershipState {
    INVITED = 1,
    ACCEPTED = 2
}
//# sourceMappingURL=teams.d.ts.map