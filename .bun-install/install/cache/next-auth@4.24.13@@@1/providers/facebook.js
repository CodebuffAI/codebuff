"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Facebook;
function Facebook(options) {
  return {
    id: "facebook",
    name: "Facebook",
    type: "oauth",
    authorization: "https://www.facebook.com/v11.0/dialog/oauth?scope=email",
    token: "https://graph.facebook.com/oauth/access_token",
    userinfo: {
      url: "https://graph.facebook.com/me",
      params: {
        fields: "id,name,email,picture"
      },
      async request({
        tokens,
        client,
        provider
      }) {
        var _provider$userinfo;
        return await client.userinfo(tokens.access_token, {
          params: (_provider$userinfo = provider.userinfo) === null || _provider$userinfo === void 0 ? void 0 : _provider$userinfo.params
        });
      }
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.picture.data.url
      };
    },
    style: {
      logo: "/facebook.svg",
      bg: "#006aff",
      text: "#fff"
    },
    options
  };
}