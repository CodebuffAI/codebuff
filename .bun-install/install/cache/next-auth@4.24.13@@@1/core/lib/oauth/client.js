"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.openidClient = openidClient;
var _openidClient = require("openid-client");
async function openidClient(options) {
  const provider = options.provider;
  if (provider.httpOptions) _openidClient.custom.setHttpOptionsDefaults(provider.httpOptions);
  let issuer;
  if (provider.wellKnown) {
    issuer = await _openidClient.Issuer.discover(provider.wellKnown);
  } else {
    var _provider$authorizati, _provider$token, _provider$userinfo;
    issuer = new _openidClient.Issuer({
      issuer: provider.issuer,
      authorization_endpoint: (_provider$authorizati = provider.authorization) === null || _provider$authorizati === void 0 ? void 0 : _provider$authorizati.url,
      token_endpoint: (_provider$token = provider.token) === null || _provider$token === void 0 ? void 0 : _provider$token.url,
      userinfo_endpoint: (_provider$userinfo = provider.userinfo) === null || _provider$userinfo === void 0 ? void 0 : _provider$userinfo.url,
      jwks_uri: provider.jwks_endpoint
    });
  }
  const client = new issuer.Client({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uris: [provider.callbackUrl],
    ...provider.client
  }, provider.jwks);
  client[_openidClient.custom.clock_tolerance] = 10;
  return client;
}