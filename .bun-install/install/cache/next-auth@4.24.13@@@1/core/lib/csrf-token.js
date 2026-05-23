"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createCSRFToken = createCSRFToken;
var _crypto = require("crypto");
function createCSRFToken({
  options,
  cookieValue,
  isPost,
  bodyValue
}) {
  if (cookieValue) {
    const [csrfToken, csrfTokenHash] = cookieValue.split("|");
    const expectedCsrfTokenHash = (0, _crypto.createHash)("sha256").update(`${csrfToken}${options.secret}`).digest("hex");
    if (csrfTokenHash === expectedCsrfTokenHash) {
      const csrfTokenVerified = isPost && csrfToken === bodyValue;
      return {
        csrfTokenVerified,
        csrfToken
      };
    }
  }
  const csrfToken = (0, _crypto.randomBytes)(32).toString("hex");
  const csrfTokenHash = (0, _crypto.createHash)("sha256").update(`${csrfToken}${options.secret}`).digest("hex");
  const cookie = `${csrfToken}|${csrfTokenHash}`;
  return {
    cookie,
    csrfToken
  };
}