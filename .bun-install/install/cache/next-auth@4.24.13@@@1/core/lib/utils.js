"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createSecret = createSecret;
exports.fromDate = fromDate;
exports.hashToken = hashToken;
var _crypto = require("crypto");
function fromDate(time, date = Date.now()) {
  return new Date(date + time * 1000);
}
function hashToken(token, options) {
  var _provider$secret;
  const {
    provider,
    secret
  } = options;
  return (0, _crypto.createHash)("sha256").update(`${token}${(_provider$secret = provider.secret) !== null && _provider$secret !== void 0 ? _provider$secret : secret}`).digest("hex");
}
function createSecret(params) {
  var _authOptions$secret;
  const {
    authOptions,
    url
  } = params;
  return (_authOptions$secret = authOptions.secret) !== null && _authOptions$secret !== void 0 ? _authOptions$secret : (0, _crypto.createHash)("sha256").update(JSON.stringify({
    ...url,
    ...authOptions
  })).digest("hex");
}