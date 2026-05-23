"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.oAuth1Client = oAuth1Client;
exports.oAuth1TokenStore = void 0;
var _oauth = require("oauth");
function oAuth1Client(options) {
  var _provider$version, _provider$encoding;
  const provider = options.provider;
  const oauth1Client = new _oauth.OAuth(provider.requestTokenUrl, provider.accessTokenUrl, provider.clientId, provider.clientSecret, (_provider$version = provider.version) !== null && _provider$version !== void 0 ? _provider$version : "1.0", provider.callbackUrl, (_provider$encoding = provider.encoding) !== null && _provider$encoding !== void 0 ? _provider$encoding : "HMAC-SHA1");
  const originalGet = oauth1Client.get.bind(oauth1Client);
  oauth1Client.get = async (...args) => {
    return await new Promise((resolve, reject) => {
      originalGet(...args, (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      });
    });
  };
  const originalGetOAuth1AccessToken = oauth1Client.getOAuthAccessToken.bind(oauth1Client);
  oauth1Client.getOAuthAccessToken = async (...args) => {
    return await new Promise((resolve, reject) => {
      originalGetOAuth1AccessToken(...args, (error, oauth_token, oauth_token_secret) => {
        if (error) {
          return reject(error);
        }
        resolve({
          oauth_token,
          oauth_token_secret
        });
      });
    });
  };
  const originalGetOAuthRequestToken = oauth1Client.getOAuthRequestToken.bind(oauth1Client);
  oauth1Client.getOAuthRequestToken = async (params = {}) => {
    return await new Promise((resolve, reject) => {
      originalGetOAuthRequestToken(params, (error, oauth_token, oauth_token_secret, params) => {
        if (error) {
          return reject(error);
        }
        resolve({
          oauth_token,
          oauth_token_secret,
          params
        });
      });
    });
  };
  return oauth1Client;
}
const oAuth1TokenStore = exports.oAuth1TokenStore = new Map();