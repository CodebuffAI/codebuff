"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Spotify;
function Spotify(options) {
  return {
    id: "spotify",
    name: "Spotify",
    type: "oauth",
    authorization: "https://accounts.spotify.com/authorize?scope=user-read-email",
    token: "https://accounts.spotify.com/api/token",
    userinfo: "https://api.spotify.com/v1/me",
    profile(profile) {
      var _profile$images;
      return {
        id: profile.id,
        name: profile.display_name,
        email: profile.email,
        image: (_profile$images = profile.images) === null || _profile$images === void 0 || (_profile$images = _profile$images[0]) === null || _profile$images === void 0 ? void 0 : _profile$images.url
      };
    },
    style: {
      logo: "/spotify.svg",
      text: "#fff",
      bg: "#000"
    },
    options
  };
}