"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Slack;
function Slack(options) {
  return {
    id: "slack",
    name: "Slack",
    type: "oauth",
    wellKnown: "https://slack.com/.well-known/openid-configuration",
    authorization: {
      params: {
        scope: "openid profile email"
      }
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture
      };
    },
    style: {
      logo: "/slack.svg",
      bg: "#000",
      text: "#fff"
    },
    options
  };
}