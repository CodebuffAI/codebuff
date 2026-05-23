"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SAMLJackson;
function SAMLJackson(options) {
  return {
    id: "boxyhq-saml",
    name: "BoxyHQ SAML",
    type: "oauth",
    version: "2.0",
    checks: ["pkce", "state"],
    authorization: {
      url: `${options.issuer}/api/oauth/authorize`,
      params: {
        provider: "saml"
      }
    },
    token: `${options.issuer}/api/oauth/token`,
    userinfo: `${options.issuer}/api/oauth/userinfo`,
    profile(profile) {
      return {
        id: profile.id,
        email: profile.email,
        name: [profile.firstName, profile.lastName].filter(Boolean).join(" "),
        image: null
      };
    },
    options
  };
}