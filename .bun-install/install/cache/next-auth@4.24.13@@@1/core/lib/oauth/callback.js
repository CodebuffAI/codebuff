"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = oAuthCallback;
var _openidClient = require("openid-client");
var _client = require("./client");
var _clientLegacy = require("./client-legacy");
var _checks = _interopRequireWildcard(require("./checks"));
var _errors = require("../../errors");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
async function oAuthCallback(params) {
  var _body$error, _provider$version;
  const {
    options,
    query,
    body,
    method,
    cookies
  } = params;
  const {
    logger,
    provider
  } = options;
  const errorMessage = (_body$error = body === null || body === void 0 ? void 0 : body.error) !== null && _body$error !== void 0 ? _body$error : query === null || query === void 0 ? void 0 : query.error;
  if (errorMessage) {
    const error = new Error(errorMessage);
    logger.error("OAUTH_CALLBACK_HANDLER_ERROR", {
      error,
      error_description: query === null || query === void 0 ? void 0 : query.error_description,
      providerId: provider.id
    });
    logger.debug("OAUTH_CALLBACK_HANDLER_ERROR", {
      body
    });
    throw error;
  }
  if ((_provider$version = provider.version) !== null && _provider$version !== void 0 && _provider$version.startsWith("1.")) {
    try {
      const client = await (0, _clientLegacy.oAuth1Client)(options);
      const {
        oauth_token,
        oauth_verifier
      } = query !== null && query !== void 0 ? query : {};
      const tokens = await client.getOAuthAccessToken(oauth_token, _clientLegacy.oAuth1TokenStore.get(oauth_token), oauth_verifier);
      let profile = await client.get(provider.profileUrl, tokens.oauth_token, tokens.oauth_token_secret);
      if (typeof profile === "string") {
        profile = JSON.parse(profile);
      }
      const newProfile = await getProfile({
        profile,
        tokens,
        provider,
        logger
      });
      return {
        ...newProfile,
        cookies: []
      };
    } catch (error) {
      logger.error("OAUTH_V1_GET_ACCESS_TOKEN_ERROR", error);
      throw error;
    }
  }
  if (query !== null && query !== void 0 && query.oauth_token) _clientLegacy.oAuth1TokenStore.delete(query.oauth_token);
  try {
    var _provider$token, _provider$token2, _provider$userinfo;
    const client = await (0, _client.openidClient)(options);
    let tokens;
    const checks = {};
    const resCookies = [];
    await _checks.state.use(cookies, resCookies, options, checks);
    await _checks.pkce.use(cookies, resCookies, options, checks);
    await _checks.nonce.use(cookies, resCookies, options, checks);
    const params = {
      ...client.callbackParams({
        url: `http://n?${new URLSearchParams(query)}`,
        body,
        method
      }),
      ...((_provider$token = provider.token) === null || _provider$token === void 0 ? void 0 : _provider$token.params)
    };
    if ((_provider$token2 = provider.token) !== null && _provider$token2 !== void 0 && _provider$token2.request) {
      const response = await provider.token.request({
        provider,
        params,
        checks,
        client
      });
      tokens = new _openidClient.TokenSet(response.tokens);
    } else if (provider.idToken) {
      tokens = await client.callback(provider.callbackUrl, params, checks);
    } else {
      tokens = await client.oauthCallback(provider.callbackUrl, params, checks);
    }
    if (Array.isArray(tokens.scope)) {
      tokens.scope = tokens.scope.join(" ");
    }
    let profile;
    if ((_provider$userinfo = provider.userinfo) !== null && _provider$userinfo !== void 0 && _provider$userinfo.request) {
      profile = await provider.userinfo.request({
        provider,
        tokens,
        client
      });
    } else if (provider.idToken) {
      profile = tokens.claims();
    } else {
      var _provider$userinfo2;
      profile = await client.userinfo(tokens, {
        params: (_provider$userinfo2 = provider.userinfo) === null || _provider$userinfo2 === void 0 ? void 0 : _provider$userinfo2.params
      });
    }
    const profileResult = await getProfile({
      profile,
      provider,
      tokens,
      logger
    });
    return {
      ...profileResult,
      cookies: resCookies
    };
  } catch (error) {
    throw new _errors.OAuthCallbackError(error);
  }
}
async function getProfile({
  profile: OAuthProfile,
  tokens,
  provider,
  logger
}) {
  try {
    var _profile$email;
    logger.debug("PROFILE_DATA", {
      OAuthProfile
    });
    const profile = await provider.profile(OAuthProfile, tokens);
    profile.email = (_profile$email = profile.email) === null || _profile$email === void 0 ? void 0 : _profile$email.toLowerCase();
    if (!profile.id) throw new TypeError(`Profile id is missing in ${provider.name} OAuth profile response`);
    return {
      profile,
      account: {
        provider: provider.id,
        type: provider.type,
        providerAccountId: profile.id.toString(),
        ...tokens
      },
      OAuthProfile
    };
  } catch (error) {
    logger.error("OAUTH_PARSE_PROFILE_ERROR", {
      error: error,
      OAuthProfile
    });
  }
}