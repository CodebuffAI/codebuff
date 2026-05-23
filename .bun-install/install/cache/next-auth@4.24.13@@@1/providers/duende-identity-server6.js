"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = DuendeIdentityServer6;
function DuendeIdentityServer6(options) {
  return {
    id: "duende-identityserver6",
    name: "DuendeIdentityServer6",
    type: "oauth",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: "openid profile email"
      }
    },
    checks: ["pkce", "state"],
    idToken: true,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: null
      };
    },
    options
  };
}