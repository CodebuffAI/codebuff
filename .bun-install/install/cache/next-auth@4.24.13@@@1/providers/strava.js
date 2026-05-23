"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Strava;
function Strava(options) {
  return {
    id: "strava",
    name: "Strava",
    type: "oauth",
    authorization: {
      url: "https://www.strava.com/api/v3/oauth/authorize",
      params: {
        scope: "read",
        approval_prompt: "auto",
        response_type: "code"
      }
    },
    token: {
      url: "https://www.strava.com/api/v3/oauth/token"
    },
    userinfo: "https://www.strava.com/api/v3/athlete",
    client: {
      token_endpoint_auth_method: "client_secret_post"
    },
    profile(profile) {
      return {
        id: profile.id,
        name: `${profile.firstname} ${profile.lastname}`,
        email: null,
        image: profile.profile
      };
    },
    options
  };
}