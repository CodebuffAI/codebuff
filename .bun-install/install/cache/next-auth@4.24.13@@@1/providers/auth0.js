"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Auth0;
function Auth0(options) {
  return {
    id: "auth0",
    name: "Auth0",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    type: "oauth",
    authorization: {
      params: {
        scope: "openid email profile"
      }
    },
    checks: ["pkce", "state"],
    idToken: true,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.nickname,
        email: profile.email,
        image: profile.picture
      };
    },
    style: {
      logo: "/auth0.svg",
      text: "#fff",
      bg: "#EB5424"
    },
    options
  };
}