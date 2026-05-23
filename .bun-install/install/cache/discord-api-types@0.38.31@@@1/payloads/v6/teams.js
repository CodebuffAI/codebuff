"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/topics/teams
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamMemberMembershipState = void 0;
/**
 * https://discord.com/developers/docs/topics/teams#data-models-membership-state-enum
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
var TeamMemberMembershipState;
(function (TeamMemberMembershipState) {
    TeamMemberMembershipState[TeamMemberMembershipState["INVITED"] = 1] = "INVITED";
    TeamMemberMembershipState[TeamMemberMembershipState["ACCEPTED"] = 2] = "ACCEPTED";
})(TeamMemberMembershipState || (exports.TeamMemberMembershipState = TeamMemberMembershipState = {}));
//# sourceMappingURL=teams.js.map