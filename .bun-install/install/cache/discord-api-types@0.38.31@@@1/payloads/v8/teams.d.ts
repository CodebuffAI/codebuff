/**
 * Types extracted from https://discord.com/developers/docs/topics/teams
 */
import type { Snowflake } from '../../globals';
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/topics/teams#data-models-team-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APITeam {
    /**
     * A hash of the image of the team's icon
     */
    icon: string | null;
    /**
     * The unique id of the team
     */
    id: Snowflake;
    /**
     * The members of the team
     */
    members: APITeamMember[];
    /**
     * The name of the team
     */
    name: string;
    /**
     * The user id of the current team owner
     */
    owner_user_id: Snowflake;
}
/**
 * https://discord.com/developers/docs/topics/teams#data-models-team-members-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APITeamMember {
    /**
     * The user's membership state on the team
     *
     * See https://discord.com/developers/docs/topics/teams#data-models-membership-state-enum
     */
    membership_state: TeamMemberMembershipState;
    /**
     * Will always be `["*"]`
     */
    permissions: ['*'];
    /**
     * The id of the parent team of which they are a member
     */
    team_id: Snowflake;
    /**
     * The avatar, discriminator, id, and username of the user
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    user: APIUser;
}
/**
 * https://discord.com/developers/docs/topics/teams#data-models-membership-state-enum
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum TeamMemberMembershipState {
    Invited = 1,
    Accepted = 2
}
//# sourceMappingURL=teams.d.ts.map