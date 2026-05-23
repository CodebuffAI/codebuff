"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Pipedrive;
function Pipedrive(options) {
  return {
    id: "pipedrive",
    name: "Pipedrive",
    type: "oauth",
    version: "2.0",
    authorization: "https://oauth.pipedrive.com/oauth/authorize",
    token: "https://oauth.pipedrive.com/oauth/token",
    userinfo: "https://api.pipedrive.com/users/me",
    profile: ({
      data: profile
    }) => {
      return {
        id: String(profile.id),
        name: profile.name,
        email: profile.email,
        image: profile.icon_url
      };
    },
    options
  };
}