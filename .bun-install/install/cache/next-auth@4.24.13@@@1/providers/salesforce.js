"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Salesforce;
function Salesforce(options) {
  const {
    issuer = "https://login.salesforce.com"
  } = options;
  return {
    id: "salesforce",
    name: "Salesforce",
    type: "oauth",
    authorization: `${issuer}/services/oauth2/authorize?display=page`,
    token: `${issuer}/services/oauth2/token`,
    userinfo: `${issuer}/services/oauth2/userinfo`,
    profile(profile) {
      return {
        id: profile.user_id,
        name: null,
        email: null,
        image: profile.picture
      };
    },
    checks: ["none"],
    options
  };
}