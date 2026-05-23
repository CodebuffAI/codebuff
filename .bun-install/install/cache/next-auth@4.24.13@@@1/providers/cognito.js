"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Cognito;
function Cognito(options) {
  return {
    id: "cognito",
    name: "Cognito",
    type: "oauth",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    idToken: true,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture
      };
    },
    style: {
      logo: "/cognito.svg",
      bg: "#fff",
      text: "#C17B9E"
    },
    options
  };
}