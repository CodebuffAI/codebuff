"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Google;
function Google(options) {
  return {
    id: "google",
    name: "Google",
    type: "oauth",
    wellKnown: "https://accounts.google.com/.well-known/openid-configuration",
    authorization: {
      params: {
        scope: "openid email profile"
      }
    },
    idToken: true,
    checks: ["pkce", "state"],
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture
      };
    },
    style: {
      logo: "/google.svg",
      bg: "#fff",
      text: "#000"
    },
    options
  };
}