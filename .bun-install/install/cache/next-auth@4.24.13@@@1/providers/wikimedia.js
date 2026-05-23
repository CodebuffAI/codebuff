"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Wikimedia;
function Wikimedia(options) {
  return {
    id: "wikimedia",
    name: "Wikimedia",
    type: "oauth",
    token: "https://meta.wikimedia.org/w/rest.php/oauth2/access_token",
    userinfo: "https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile",
    authorization: {
      url: "https://meta.wikimedia.org/w/rest.php/oauth2/authorize",
      params: {
        scope: ""
      }
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.username,
        email: profile.email
      };
    },
    style: {
      logo: "/wikimedia.svg",
      bg: "#000",
      text: "#fff"
    },
    options
  };
}