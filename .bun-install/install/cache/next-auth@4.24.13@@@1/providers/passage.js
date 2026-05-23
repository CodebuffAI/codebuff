"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Passage;
function Passage(config) {
  var _config$issuer;
  config.issuer = (_config$issuer = config.issuer) === null || _config$issuer === void 0 ? void 0 : _config$issuer.replace(/\/$/, "");
  return {
    id: "passage",
    name: "Passage",
    type: "oauth",
    wellKnown: `${config.issuer}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: "openid email"
      }
    },
    client: {
      token_endpoint_auth_method: "client_secret_basic"
    },
    checks: ["pkce", "state"],
    profile(profile) {
      return {
        id: profile.sub,
        name: null,
        email: profile.email,
        image: null
      };
    },
    style: {
      logo: "/passage.svg",
      logoDark: "/passage.svg",
      bg: "#fff",
      bgDark: "#fff",
      text: "#000",
      textDark: "#000"
    },
    options: config
  };
}