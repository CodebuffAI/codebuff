"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Authentik;
function Authentik(options) {
  return {
    id: "authentik",
    name: "Authentik",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    type: "oauth",
    authorization: {
      params: {
        scope: "openid email profile"
      }
    },
    checks: ["pkce", "state"],
    profile(profile) {
      var _profile$name;
      return {
        id: profile.sub,
        name: (_profile$name = profile.name) !== null && _profile$name !== void 0 ? _profile$name : profile.preferred_username,
        email: profile.email,
        image: profile.picture
      };
    },
    options
  };
}