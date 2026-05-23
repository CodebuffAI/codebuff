"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Instagram;
function Instagram(options) {
  return {
    id: "instagram",
    name: "Instagram",
    type: "oauth",
    authorization: "https://api.instagram.com/oauth/authorize?scope=user_profile",
    token: "https://api.instagram.com/oauth/access_token",
    userinfo: "https://graph.instagram.com/me?fields=id,username,account_type,name",
    client: {
      token_endpoint_auth_method: "client_secret_post"
    },
    async profile(profile) {
      return {
        id: profile.id,
        name: profile.username,
        email: null,
        image: null
      };
    },
    style: {
      logo: "/instagram.svg",
      bg: "#fff",
      text: "#000"
    },
    options
  };
}