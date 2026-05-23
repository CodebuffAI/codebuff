"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = FusionAuth;
function FusionAuth(options) {
  return {
    id: "fusionauth",
    name: "FusionAuth",
    type: "oauth",
    wellKnown: options !== null && options !== void 0 && options.tenantId ? `${options.issuer}/.well-known/openid-configuration?tenantId=${options.tenantId}` : `${options.issuer}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: "openid offline_access",
        ...((options === null || options === void 0 ? void 0 : options.tenantId) && {
          tenantId: options.tenantId
        })
      }
    },
    checks: ["pkce", "state"],
    profile(profile) {
      return {
        id: profile.sub,
        email: profile.email,
        name: profile === null || profile === void 0 ? void 0 : profile.preferred_username
      };
    },
    options
  };
}