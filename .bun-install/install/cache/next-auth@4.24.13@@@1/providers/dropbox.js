"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Dropbox;
function Dropbox(options) {
  return {
    id: "dropbox",
    name: "Dropbox",
    type: "oauth",
    authorization: "https://www.dropbox.com/oauth2/authorize?token_access_type=offline&scope=account_info.read",
    token: "https://api.dropboxapi.com/oauth2/token",
    userinfo: "https://api.dropboxapi.com/2/users/get_current_account",
    profile(profile) {
      return {
        id: profile.account_id,
        name: profile.name.display_name,
        email: profile.email,
        image: profile.profile_photo_url
      };
    },
    checks: ["state", "pkce"],
    options
  };
}