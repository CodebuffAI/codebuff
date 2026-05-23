"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/invite
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteTargetType = void 0;
/**
 * https://discord.com/developers/docs/resources/invite#invite-object-invite-target-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
var InviteTargetType;
(function (InviteTargetType) {
    InviteTargetType[InviteTargetType["Stream"] = 1] = "Stream";
    InviteTargetType[InviteTargetType["EmbeddedApplication"] = 2] = "EmbeddedApplication";
})(InviteTargetType || (exports.InviteTargetType = InviteTargetType = {}));
//# sourceMappingURL=invite.js.map