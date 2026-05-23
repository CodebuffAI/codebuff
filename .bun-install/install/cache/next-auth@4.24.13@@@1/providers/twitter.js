"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TwitterLegacy = TwitterLegacy;
exports.default = Twitter;
function TwitterLegacy(options) {
  return {
    id: "twitter",
    name: "Twitter (Legacy)",
    type: "oauth",
    version: "1.0A",
    authorization: "https://api.twitter.com/oauth/authenticate",
    accessTokenUrl: "https://api.twitter.com/oauth/access_token",
    requestTokenUrl: "https://api.twitter.com/oauth/request_token",
    profileUrl: "https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true",
    profile(profile) {
      return {
        id: profile.id_str,
        name: profile.name,
        email: profile.email,
        image: profile.profile_image_url_https.replace(/_normal\.(jpg|png|gif)$/, ".$1")
      };
    },
    style: {
      logo: "/twitter.svg",
      bg: "#1da1f2",
      text: "#fff"
    },
    options
  };
}
function Twitter(options) {
  if (options.version === "2.0") {
    return {
      id: "twitter",
      name: "Twitter",
      version: "2.0",
      type: "oauth",
      authorization: {
        url: "https://twitter.com/i/oauth2/authorize",
        params: {
          scope: "users.read tweet.read offline.access"
        }
      },
      token: {
        url: "https://api.twitter.com/2/oauth2/token",
        async request({
          client,
          params,
          checks,
          provider
        }) {
          const response = await client.oauthCallback(provider.callbackUrl, params, checks, {
            exchangeBody: {
              client_id: options.clientId
            }
          });
          return {
            tokens: response
          };
        }
      },
      userinfo: {
        url: "https://api.twitter.com/2/users/me",
        params: {
          "user.fields": "profile_image_url"
        }
      },
      profile({
        data
      }) {
        return {
          id: data.id,
          name: data.name,
          email: null,
          image: data.profile_image_url
        };
      },
      checks: ["pkce", "state"],
      style: {
        logo: "/twitter.svg",
        bg: "#1da1f2",
        text: "#fff"
      },
      options
    };
  }
  return TwitterLegacy(options);
}