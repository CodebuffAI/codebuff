"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = email;
var _crypto = require("crypto");
var _utils = require("../utils");
async function email(identifier, options) {
  var _await$provider$gener, _provider$generateVer, _provider$maxAge, _adapter$createVerifi;
  const {
    url,
    adapter,
    provider,
    callbackUrl,
    theme
  } = options;
  const token = (_await$provider$gener = await ((_provider$generateVer = provider.generateVerificationToken) === null || _provider$generateVer === void 0 ? void 0 : _provider$generateVer.call(provider))) !== null && _await$provider$gener !== void 0 ? _await$provider$gener : (0, _crypto.randomBytes)(32).toString("hex");
  const ONE_DAY_IN_SECONDS = 86400;
  const expires = new Date(Date.now() + ((_provider$maxAge = provider.maxAge) !== null && _provider$maxAge !== void 0 ? _provider$maxAge : ONE_DAY_IN_SECONDS) * 1000);
  const params = new URLSearchParams({
    callbackUrl,
    token,
    email: identifier
  });
  const _url = `${url}/callback/${provider.id}?${params}`;
  await Promise.all([provider.sendVerificationRequest({
    identifier,
    token,
    expires,
    url: _url,
    provider,
    theme
  }), (_adapter$createVerifi = adapter.createVerificationToken) === null || _adapter$createVerifi === void 0 ? void 0 : _adapter$createVerifi.call(adapter, {
    identifier,
    token: (0, _utils.hashToken)(token, options),
    expires
  })]);
  return `${url}/verify-request?${new URLSearchParams({
    provider: provider.id,
    type: provider.type
  })}`;
}