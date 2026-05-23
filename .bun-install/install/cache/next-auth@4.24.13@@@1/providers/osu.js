"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Osu;
function Osu(options) {
  return {
    id: "osu",
    name: "Osu!",
    type: "oauth",
    token: "https://osu.ppy.sh/oauth/token",
    authorization: {
      url: "https://osu.ppy.sh/oauth/authorize",
      params: {
        scope: "identify"
      }
    },
    userinfo: "https://osu.ppy.sh/api/v2/me",
    profile(profile) {
      return {
        id: profile.id,
        email: null,
        name: profile.username,
        image: profile.avatar_url
      };
    },
    options
  };
}