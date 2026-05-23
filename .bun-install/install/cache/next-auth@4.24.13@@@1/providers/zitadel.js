"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Zitadel;
function Zitadel(options) {
  const {
    issuer
  } = options;
  return {
    id: "zitadel",
    name: "ZITADEL",
    type: "oauth",
    version: "2",
    wellKnown: `${issuer}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: "openid email profile"
      }
    },
    idToken: true,
    checks: ["pkce", "state"],
    async profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture
      };
    },
    options
  };
}