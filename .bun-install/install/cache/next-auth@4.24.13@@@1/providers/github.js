"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Github;
function Github(options) {
  return {
    id: "github",
    name: "GitHub",
    type: "oauth",
    authorization: {
      url: "https://github.com/login/oauth/authorize",
      params: {
        scope: "read:user user:email"
      }
    },
    token: "https://github.com/login/oauth/access_token",
    userinfo: {
      url: "https://api.github.com/user",
      async request({
        client,
        tokens
      }) {
        const profile = await client.userinfo(tokens.access_token);
        if (!profile.email) {
          const res = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `token ${tokens.access_token}`
            }
          });
          if (res.ok) {
            var _emails$find;
            const emails = await res.json();
            profile.email = ((_emails$find = emails.find(e => e.primary)) !== null && _emails$find !== void 0 ? _emails$find : emails[0]).email;
          }
        }
        return profile;
      }
    },
    profile(profile) {
      var _profile$name;
      return {
        id: profile.id.toString(),
        name: (_profile$name = profile.name) !== null && _profile$name !== void 0 ? _profile$name : profile.login,
        email: profile.email,
        image: profile.avatar_url
      };
    },
    style: {
      logo: "/github.svg",
      bg: "#24292f",
      text: "#fff"
    },
    options
  };
}