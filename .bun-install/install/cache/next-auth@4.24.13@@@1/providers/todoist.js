"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = TodoistProvider;
function TodoistProvider(options) {
  return {
    id: "todoist",
    name: "Todoist",
    type: "oauth",
    authorization: {
      url: "https://todoist.com/oauth/authorize",
      params: {
        scope: "data:read"
      }
    },
    token: "https://todoist.com/oauth/access_token",
    client: {
      token_endpoint_auth_method: "client_secret_post"
    },
    userinfo: {
      request: async ({
        tokens
      }) => {
        const res = await fetch("https://api.todoist.com/sync/v9/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sync_token: "*",
            resource_types: '["user"]'
          })
        });
        const {
          user: profile
        } = await res.json();
        return profile;
      }
    },
    profile: async profile => {
      return {
        id: profile.id,
        email: profile.email,
        name: profile.full_name,
        image: profile.avatar_big
      };
    },
    style: {
      logo: "/todoist.svg",
      text: "#000",
      bg: "#E44332"
    },
    ...options
  };
}