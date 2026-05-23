"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/invite
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteTargetType = exports.InviteType = exports.InviteFlags = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/invite#invite-object-guild-invite-flags}
 */
var InviteFlags;
(function (InviteFlags) {
    InviteFlags[InviteFlags["IsGuestInvite"] = 1] = "IsGuestInvite";
})(InviteFlags || (exports.InviteFlags = InviteFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/invite#invite-object-invite-types}
 */
var InviteType;
(function (InviteType) {
    InviteType[InviteType["Guild"] = 0] = "Guild";
    InviteType[InviteType["GroupDM"] = 1] = "GroupDM";
    InviteType[InviteType["Friend"] = 2] = "Friend";
})(InviteType || (exports.InviteType = InviteType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/invite#invite-object-invite-target-types}
 */
var InviteTargetType;
(function (InviteTargetType) {
    InviteTargetType[InviteTargetType["Stream"] = 1] = "Stream";
    InviteTargetType[InviteTargetType["EmbeddedApplication"] = 2] = "EmbeddedApplication";
})(InviteTargetType || (exports.InviteTargetType = InviteTargetType = {}));
//# sourceMappingURL=invite.js.map