"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = BattleNet;
function BattleNet(options) {
  return {
    id: "battlenet",
    name: "Battle.net",
    type: "oauth",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.battle_tag,
        email: null,
        image: null
      };
    },
    style: {
      logo: "/battlenet.svg",
      bg: "#148eff",
      text: "#fff"
    },
    options
  };
}