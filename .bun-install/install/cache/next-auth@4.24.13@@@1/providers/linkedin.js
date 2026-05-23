"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = LinkedIn;
function LinkedIn(options) {
  return {
    id: "linkedin",
    name: "LinkedIn",
    type: "oauth",
    authorization: {
      url: "https://www.linkedin.com/oauth/v2/authorization",
      params: {
        scope: "openid profile email"
      }
    },
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    client: {
      token_endpoint_auth_method: "client_secret_post"
    },
    userinfo: {
      url: "https://api.linkedin.com/v2/me",
      params: {
        projection: `(id,localizedFirstName,localizedLastName,profilePicture(displayImage~digitalmediaAsset:playableStreams))`
      }
    },
    async profile(profile, tokens) {
      var _emailData$elements, _profile$profilePictu;
      const emailResponse = await fetch("https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const emailData = await emailResponse.json();
      return {
        id: profile.id,
        name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
        email: emailData === null || emailData === void 0 || (_emailData$elements = emailData.elements) === null || _emailData$elements === void 0 || (_emailData$elements = _emailData$elements[0]) === null || _emailData$elements === void 0 || (_emailData$elements = _emailData$elements["handle~"]) === null || _emailData$elements === void 0 ? void 0 : _emailData$elements.emailAddress,
        image: (_profile$profilePictu = profile.profilePicture) === null || _profile$profilePictu === void 0 || (_profile$profilePictu = _profile$profilePictu["displayImage~"]) === null || _profile$profilePictu === void 0 || (_profile$profilePictu = _profile$profilePictu.elements) === null || _profile$profilePictu === void 0 || (_profile$profilePictu = _profile$profilePictu[0]) === null || _profile$profilePictu === void 0 || (_profile$profilePictu = _profile$profilePictu.identifiers) === null || _profile$profilePictu === void 0 || (_profile$profilePictu = _profile$profilePictu[0]) === null || _profile$profilePictu === void 0 ? void 0 : _profile$profilePictu.identifier
      };
    },
    style: {
      logo: "/linkedin.svg",
      bg: "#069",
      text: "#fff"
    },
    options
  };
}