"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = HubSpot;
const HubSpotConfig = {
  authorizationUrl: "https://app.hubspot.com/oauth/authorize",
  tokenUrl: "https://api.hubapi.com/oauth/v1/token",
  profileUrl: "https://api.hubapi.com/oauth/v1/access-tokens"
};
function HubSpot(options) {
  return {
    id: "hubspot",
    name: "HubSpot",
    type: "oauth",
    ...HubSpotConfig,
    authorization: {
      url: HubSpotConfig.authorizationUrl,
      params: {
        scope: "oauth",
        client_id: options.clientId
      }
    },
    client: {
      token_endpoint_auth_method: "client_secret_post"
    },
    token: HubSpotConfig.tokenUrl,
    userinfo: {
      url: HubSpotConfig.profileUrl,
      async request(context) {
        const url = `${HubSpotConfig.profileUrl}/${context.tokens.access_token}`;
        const response = await fetch(url, {
          headers: {
            "Content-Type": "application/json"
          },
          method: "GET"
        });
        return await response.json();
      }
    },
    profile(profile) {
      return {
        id: profile.user_id,
        name: profile.user,
        email: profile.user,
        image: null
      };
    },
    style: {
      logo: "/hubspot.svg",
      bg: "#ff7a59",
      text: "#fff"
    },
    options
  };
}