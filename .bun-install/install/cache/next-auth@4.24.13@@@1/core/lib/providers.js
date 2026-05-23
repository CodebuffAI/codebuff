"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = parseProviders;
var _merge = require("../../utils/merge");
function parseProviders(params) {
  const {
    url,
    providerId
  } = params;
  const providers = params.providers.map(({
    options: userOptions,
    ...rest
  }) => {
    var _ref;
    if (rest.type === "oauth") {
      var _normalizedUserOption;
      const normalizedOptions = normalizeOAuthOptions(rest);
      const normalizedUserOptions = normalizeOAuthOptions(userOptions, true);
      const id = (_normalizedUserOption = normalizedUserOptions === null || normalizedUserOptions === void 0 ? void 0 : normalizedUserOptions.id) !== null && _normalizedUserOption !== void 0 ? _normalizedUserOption : rest.id;
      return (0, _merge.merge)(normalizedOptions, {
        ...normalizedUserOptions,
        signinUrl: `${url}/signin/${id}`,
        callbackUrl: `${url}/callback/${id}`
      });
    }
    const id = (_ref = userOptions === null || userOptions === void 0 ? void 0 : userOptions.id) !== null && _ref !== void 0 ? _ref : rest.id;
    return (0, _merge.merge)(rest, {
      ...userOptions,
      signinUrl: `${url}/signin/${id}`,
      callbackUrl: `${url}/callback/${id}`
    });
  });
  return {
    providers,
    provider: providers.find(({
      id
    }) => id === providerId)
  };
}
function normalizeOAuthOptions(oauthOptions, isUserOptions = false) {
  var _normalized$version;
  if (!oauthOptions) return;
  const normalized = Object.entries(oauthOptions).reduce((acc, [key, value]) => {
    if (["authorization", "token", "userinfo"].includes(key) && typeof value === "string") {
      var _url$searchParams;
      const url = new URL(value);
      acc[key] = {
        url: `${url.origin}${url.pathname}`,
        params: Object.fromEntries((_url$searchParams = url.searchParams) !== null && _url$searchParams !== void 0 ? _url$searchParams : [])
      };
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});
  if (!isUserOptions && !((_normalized$version = normalized.version) !== null && _normalized$version !== void 0 && _normalized$version.startsWith("1."))) {
    var _ref2, _normalized$idToken, _normalized$wellKnown, _normalized$authoriza;
    normalized.idToken = Boolean((_ref2 = (_normalized$idToken = normalized.idToken) !== null && _normalized$idToken !== void 0 ? _normalized$idToken : (_normalized$wellKnown = normalized.wellKnown) === null || _normalized$wellKnown === void 0 ? void 0 : _normalized$wellKnown.includes("openid-configuration")) !== null && _ref2 !== void 0 ? _ref2 : (_normalized$authoriza = normalized.authorization) === null || _normalized$authoriza === void 0 || (_normalized$authoriza = _normalized$authoriza.params) === null || _normalized$authoriza === void 0 || (_normalized$authoriza = _normalized$authoriza.scope) === null || _normalized$authoriza === void 0 ? void 0 : _normalized$authoriza.includes("openid"));
    if (!normalized.checks) normalized.checks = ["state"];
  }
  return normalized;
}