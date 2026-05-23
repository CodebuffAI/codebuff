"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = GitLab;
function GitLab(options) {
  return {
    id: "gitlab",
    name: "GitLab",
    type: "oauth",
    authorization: {
      url: "https://gitlab.com/oauth/authorize",
      params: {
        scope: "read_user"
      }
    },
    token: "https://gitlab.com/oauth/token",
    userinfo: "https://gitlab.com/api/v4/user",
    checks: ["pkce", "state"],
    profile(profile) {
      var _profile$name;
      return {
        id: profile.id.toString(),
        name: (_profile$name = profile.name) !== null && _profile$name !== void 0 ? _profile$name : profile.username,
        email: profile.email,
        image: profile.avatar_url
      };
    },
    style: {
      logo: "/gitlab.svg",
      bg: "#FC6D26",
      text: "#fff"
    },
    options
  };
}