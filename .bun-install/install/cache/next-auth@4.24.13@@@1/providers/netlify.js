"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Netlify;
function Netlify(options) {
  return {
    id: "netlify",
    name: "Netlify",
    type: "oauth",
    authorization: "https://app.netlify.com/authorize",
    token: "https://api.netlify.com/oauth/token",
    userinfo: "https://api.netlify.com/api/v1/user",
    profile(profile) {
      return {
        id: profile.id,
        name: profile.full_name,
        email: profile.email,
        image: profile.avatar_url
      };
    },
    options
  };
}