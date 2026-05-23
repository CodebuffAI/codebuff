"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.assertConfig = assertConfig;
var _errors = require("../errors");
var _parseUrl = _interopRequireDefault(require("../../utils/parse-url"));
var _cookie = require("./cookie");
let warned = false;
function isValidHttpUrl(url, baseUrl) {
  try {
    return /^https?:/.test(new URL(url, url.startsWith("/") ? baseUrl : undefined).protocol);
  } catch (_unused) {
    return false;
  }
}
function assertConfig(params) {
  var _req$query, _req$query2, _options$useSecureCoo, _req$cookies, _options$cookies$call, _options$cookies;
  const {
    options,
    req
  } = params;
  const warnings = [];
  if (!warned) {
    if (!req.origin) warnings.push("NEXTAUTH_URL");
    if (!options.secret && process.env.NODE_ENV !== "production") warnings.push("NO_SECRET");
    if (options.debug) warnings.push("DEBUG_ENABLED");
  }
  if (!options.secret && process.env.NODE_ENV === "production") {
    return new _errors.MissingSecret("Please define a `secret` in production.");
  }
  if (!((_req$query = req.query) !== null && _req$query !== void 0 && _req$query.nextauth) && !req.action) {
    return new _errors.MissingAPIRoute("Cannot find [...nextauth].{js,ts} in `/pages/api/auth`. Make sure the filename is written correctly.");
  }
  const callbackUrlParam = (_req$query2 = req.query) === null || _req$query2 === void 0 ? void 0 : _req$query2.callbackUrl;
  const url = (0, _parseUrl.default)(req.origin);
  if (callbackUrlParam && !isValidHttpUrl(callbackUrlParam, url.base)) {
    return new _errors.InvalidCallbackUrl(`Invalid callback URL. Received: ${callbackUrlParam}`);
  }
  const {
    callbackUrl: defaultCallbackUrl
  } = (0, _cookie.defaultCookies)((_options$useSecureCoo = options.useSecureCookies) !== null && _options$useSecureCoo !== void 0 ? _options$useSecureCoo : url.base.startsWith("https://"));
  const callbackUrlCookie = (_req$cookies = req.cookies) === null || _req$cookies === void 0 ? void 0 : _req$cookies[(_options$cookies$call = (_options$cookies = options.cookies) === null || _options$cookies === void 0 || (_options$cookies = _options$cookies.callbackUrl) === null || _options$cookies === void 0 ? void 0 : _options$cookies.name) !== null && _options$cookies$call !== void 0 ? _options$cookies$call : defaultCallbackUrl.name];
  if (callbackUrlCookie && !isValidHttpUrl(callbackUrlCookie, url.base)) {
    return new _errors.InvalidCallbackUrl(`Invalid callback URL. Received: ${callbackUrlCookie}`);
  }
  let hasCredentials, hasEmail;
  let hasTwitterOAuth2;
  for (const provider of options.providers) {
    if (provider.type === "credentials") hasCredentials = true;else if (provider.type === "email") hasEmail = true;else if (provider.id === "twitter" && provider.version === "2.0") hasTwitterOAuth2 = true;
  }
  if (hasCredentials) {
    var _options$session;
    const dbStrategy = ((_options$session = options.session) === null || _options$session === void 0 ? void 0 : _options$session.strategy) === "database";
    const onlyCredentials = !options.providers.some(p => p.type !== "credentials");
    if (dbStrategy && onlyCredentials) {
      return new _errors.UnsupportedStrategy("Signin in with credentials only supported if JWT strategy is enabled");
    }
    const credentialsNoAuthorize = options.providers.some(p => p.type === "credentials" && !p.authorize);
    if (credentialsNoAuthorize) {
      return new _errors.MissingAuthorize("Must define an authorize() handler to use credentials authentication provider");
    }
  }
  if (hasEmail) {
    const {
      adapter
    } = options;
    if (!adapter) {
      return new _errors.MissingAdapter("E-mail login requires an adapter.");
    }
    const missingMethods = ["createVerificationToken", "useVerificationToken", "getUserByEmail"].filter(method => !adapter[method]);
    if (missingMethods.length) {
      return new _errors.MissingAdapterMethods(`Required adapter methods were missing: ${missingMethods.join(", ")}`);
    }
  }
  if (!warned) {
    if (hasTwitterOAuth2) warnings.push("TWITTER_OAUTH_2_BETA");
    warned = true;
  }
  return warnings;
}