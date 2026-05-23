"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getAuthorizationUrl;
var _client = require("./client");
var _clientLegacy = require("./client-legacy");
var checks = _interopRequireWildcard(require("./checks"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
async function getAuthorizationUrl({
  options,
  query
}) {
  var _provider$version;
  const {
    logger,
    provider
  } = options;
  let params = {};
  if (typeof provider.authorization === "string") {
    const parsedUrl = new URL(provider.authorization);
    const parsedParams = Object.fromEntries(parsedUrl.searchParams);
    params = {
      ...params,
      ...parsedParams
    };
  } else {
    var _provider$authorizati;
    params = {
      ...params,
      ...((_provider$authorizati = provider.authorization) === null || _provider$authorizati === void 0 ? void 0 : _provider$authorizati.params)
    };
  }
  params = {
    ...params,
    ...query
  };
  if ((_provider$version = provider.version) !== null && _provider$version !== void 0 && _provider$version.startsWith("1.")) {
    var _provider$authorizati2;
    const client = (0, _clientLegacy.oAuth1Client)(options);
    const tokens = await client.getOAuthRequestToken(params);
    const url = `${(_provider$authorizati2 = provider.authorization) === null || _provider$authorizati2 === void 0 ? void 0 : _provider$authorizati2.url}?${new URLSearchParams({
      oauth_token: tokens.oauth_token,
      oauth_token_secret: tokens.oauth_token_secret,
      ...tokens.params
    })}`;
    _clientLegacy.oAuth1TokenStore.set(tokens.oauth_token, tokens.oauth_token_secret);
    logger.debug("GET_AUTHORIZATION_URL", {
      url,
      provider
    });
    return {
      redirect: url
    };
  }
  const client = await (0, _client.openidClient)(options);
  const authorizationParams = params;
  const cookies = [];
  await checks.state.create(options, cookies, authorizationParams);
  await checks.pkce.create(options, cookies, authorizationParams);
  await checks.nonce.create(options, cookies, authorizationParams);
  const url = client.authorizationUrl(authorizationParams);
  logger.debug("GET_AUTHORIZATION_URL", {
    url,
    cookies,
    provider
  });
  return {
    redirect: url,
    cookies
  };
}