"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = UnitedEffects;
function UnitedEffects(options) {
  return {
    id: "united-effects",
    name: "United Effects",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    type: "oauth",
    authorization: {
      params: {
        scope: "openid email profile",
        resource: options.issuer
      }
    },
    checks: ["pkce", "state"],
    idToken: true,
    profile(profile) {
      return {
        id: profile.sub,
        name: null,
        email: profile.email,
        image: null
      };
    },
    options
  };
}