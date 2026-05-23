"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Yandex;
function Yandex(options) {
  return {
    id: "yandex",
    name: "Yandex",
    type: "oauth",
    authorization: "https://oauth.yandex.ru/authorize?scope=login:info+login:email+login:avatar",
    token: "https://oauth.yandex.ru/token",
    userinfo: "https://login.yandex.ru/info?format=json",
    profile(profile) {
      var _ref, _profile$display_name, _ref2, _profile$default_emai, _profile$emails;
      return {
        id: profile.id,
        name: (_ref = (_profile$display_name = profile.display_name) !== null && _profile$display_name !== void 0 ? _profile$display_name : profile.real_name) !== null && _ref !== void 0 ? _ref : profile.first_name,
        email: (_ref2 = (_profile$default_emai = profile.default_email) !== null && _profile$default_emai !== void 0 ? _profile$default_emai : (_profile$emails = profile.emails) === null || _profile$emails === void 0 ? void 0 : _profile$emails[0]) !== null && _ref2 !== void 0 ? _ref2 : null,
        image: !profile.is_avatar_empty && profile.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200` : null
      };
    },
    style: {
      logo: "/yandex.svg",
      bg: "#ffcc00",
      text: "#000"
    },
    options
  };
}