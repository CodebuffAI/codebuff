"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = PinterestProvider;
function PinterestProvider(options) {
  return {
    id: "pinterest",
    name: "Pinterest",
    type: "oauth",
    authorization: {
      url: "https://www.pinterest.com/oauth",
      params: {
        scope: "user_accounts:read"
      }
    },
    checks: ["state"],
    token: "https://api.pinterest.com/v5/oauth/token",
    userinfo: "https://api.pinterest.com/v5/user_account",
    profile({
      username,
      profile_image
    }) {
      return {
        id: username,
        name: username,
        image: profile_image,
        email: null
      };
    },
    options
  };
}