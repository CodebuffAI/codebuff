"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Trakt;
function Trakt(options) {
  return {
    id: "trakt",
    name: "Trakt",
    type: "oauth",
    authorization: {
      url: "https://trakt.tv/oauth/authorize",
      params: {
        scope: ""
      }
    },
    token: "https://api.trakt.tv/oauth/token",
    userinfo: {
      async request(context) {
        const res = await fetch("https://api.trakt.tv/users/me?extended=full", {
          headers: {
            Authorization: `Bearer ${context.tokens.access_token}`,
            "trakt-api-version": "2",
            "trakt-api-key": context.provider.clientId
          }
        });
        if (res.ok) return await res.json();
        throw new Error("Expected 200 OK from the userinfo endpoint");
      }
    },
    profile(profile) {
      return {
        id: profile.ids.slug,
        name: profile.name,
        email: null,
        image: profile.images.avatar.full
      };
    },
    style: {
      logo: "/trakt.svg",
      bg: "#ED2224",
      text: "#fff"
    },
    options
  };
}